import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import Order from "@/admin/models/Order";
import User from "@/admin/models/User";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
import { deleteProductImage, saveProductImages } from "@/admin/lib/productUploads";
import { getConditionStatusFromScore } from "@/admin/lib/productCondition";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";
import { sendProductApprovalStatusEmail } from "@/store/lib/mailer";
import {
  getSoldQuantityByProductAndVariant,
  getSoldQuantityByProductIds,
} from "@/lib/productInventory";
import {
  averageVariantConditionScore,
  deriveColors,
  deriveSizes,
  normalizeStoredVariants,
  parseRequestedVariants,
  singleDefaultVariant,
  sumVariantFullStock,
  sumVariantStock,
  type RequestedVariant,
} from "@/lib/productVariants";

type StoredVariantLean = {
  _id: mongoose.Types.ObjectId;
  size: string;
  color: string | null;
  fullStock: number;
  stock: number;
  conditionScore: number | null;
  images: number[];
};

type NextVariantInput = {
  _id?: mongoose.Types.ObjectId;
  size: string;
  color: string | null;
  fullStock: number;
  stock: number;
  conditionScore: number | null;
  images: number[];
};

const ACTIVE_ORDER_STATUSES = ["processing", "confirmed"] as const;

function getAvailabilityStatus(params: {
  productType?: string;
  variants: ReadonlyArray<{ stock: number }>;
}) {
  const { productType, variants } = params;
  const totalStock = sumVariantStock(variants);
  if (totalStock <= 0) return "out-of-stock";
  if (productType === "perfume" && totalStock <= 3) return "low-stock";
  return productType === "perfume" ? "in-stock" : "available";
}

function parseStringArray(value: FormDataEntryValue | null) {
  return JSON.parse(String(value || "[]")) as string[];
}

function normalizeProductType(value: string) {
  return value === "perfume" ? "perfume" : "fashion";
}

function normalizeOriginPictures(
  productType: string,
  fashionSubtype: string | null,
  current?: Partial<Record<"front" | "back" | "left" | "right", string>>
) {
  if (productType !== "fashion") {
    return { front: "", back: "", left: "", right: "" };
  }

  return {
    front: current?.front || "",
    back: current?.back || "",
    left: fashionSubtype === "shoes" ? current?.left || "" : "",
    right: fashionSubtype === "shoes" ? current?.right || "" : "",
  };
}

// The same R2 object can be referenced from several places (a colorway
// preview reused as an origin picture, clones, etc.), so deleting a URL the
// moment one field stops using it breaks the remaining references and the
// storefront starts serving 404s. Only delete a URL once neither the updated
// product nor any other product still points at it.
async function deleteUnreferencedProductImages(params: {
  productId: string;
  candidateUrls: string[];
  keptUrls: Iterable<string>;
}) {
  const kept = new Set(Array.from(params.keptUrls).filter(Boolean));
  const candidates = [
    ...new Set(params.candidateUrls.filter((url) => Boolean(url) && !kept.has(url))),
  ];
  if (candidates.length === 0) return;

  const referencingDocs = await Product.find(
    {
      _id: { $ne: params.productId },
      $or: [
        { "images.url": { $in: candidates } },
        { "originPictures.front": { $in: candidates } },
        { "originPictures.back": { $in: candidates } },
        { "originPictures.left": { $in: candidates } },
        { "originPictures.right": { $in: candidates } },
        { cloneSourceImage: { $in: candidates } },
      ],
    },
    { "images.url": 1, originPictures: 1, cloneSourceImage: 1 }
  ).lean<Array<{
    images?: Array<{ url?: string }>;
    originPictures?: Partial<Record<"front" | "back" | "left" | "right", string>>;
    cloneSourceImage?: string;
  }>>();

  const externallyReferenced = new Set<string>();
  for (const doc of referencingDocs) {
    for (const image of doc.images || []) {
      if (image?.url) externallyReferenced.add(image.url);
    }
    for (const side of ["front", "back", "left", "right"] as const) {
      const value = doc.originPictures?.[side];
      if (value) externallyReferenced.add(value);
    }
    if (doc.cloneSourceImage) externallyReferenced.add(doc.cloneSourceImage);
  }

  await Promise.all(
    candidates
      .filter((url) => !externallyReferenced.has(url))
      .map((url) => deleteProductImage(url))
  );
}

function parseCompanionSettings(raw: FormDataEntryValue | null) {
  const str = String(raw || "").trim();
  if (!str || str === "{}") return null;
  try {
    const parsed = JSON.parse(str) as Record<string, {
      topType?: string; topColor?: { name?: string; hex: string } | null;
      bottomType?: string; bottomColor?: { name?: string; hex: string } | null;
      footwearType?: string; footwearColor?: { name?: string; hex: string } | null;
      additionalInstructions?: string;
    }>;
    return parsed;
  } catch { return null; }
}

function normalizeReference(value: unknown) {
  return String(value || "").trim();
}

function isIncompletePendingName(value: unknown) {
  const name = String(value || "").trim();
  return !name || name.toLowerCase() === "pending product";
}

function validateProductApproval(product: {
  name?: unknown;
  categories?: unknown;
  price?: unknown;
  images?: unknown;
  variants?: unknown;
}) {
  if (isIncompletePendingName(product.name)) return "Please add a product name before approval.";
  if (!Array.isArray(product.categories) || product.categories.length === 0) {
    return "Please add at least one category before approval.";
  }
  const price = Number(product.price || 0);
  if (!Number.isFinite(price) || price <= 0) return "Please add a valid price before approval.";
  if (!Array.isArray(product.images) || product.images.length < 2) {
    return "Please keep at least two product images before approval.";
  }
  const variants = normalizeStoredVariants(product.variants);
  if (variants.length === 0 || variants.every((variant) => variant.fullStock <= 0)) {
    return "Please add product size quantities before approval.";
  }
  return "";
}

function getAbsoluteUrl(pathOrUrl: string) {
  const value = String(pathOrUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const baseUrl = (
    process.env.STORE_BASE_URL ||
    process.env.NEXT_PUBLIC_STORE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.ADMIN_BASE_URL ||
    "http://localhost:3001"
  ).replace(/\/$/, "");
  return `${baseUrl}${value.startsWith("/") ? "" : "/"}${value}`;
}

function getProductEmailImageUrl(product: { images?: Array<{ url?: string; isMain?: boolean; isPublic?: boolean }> }) {
  const images = (product.images || []).filter((image) => Boolean(image?.url));
  const selected =
    images.find((image) => image.isMain && image.isPublic !== false) ||
    images.find((image) => image.isPublic !== false) ||
    images.find((image) => image.isMain) ||
    images[0];
  return getAbsoluteUrl(selected?.url || "");
}

function getStoredVariants(product: { variants?: unknown }): StoredVariantLean[] {
  return normalizeStoredVariants(product.variants).map((v) => ({
    _id: v._id,
    size: v.size,
    color: v.color,
    fullStock: v.fullStock,
    stock: v.stock,
    conditionScore: v.conditionScore,
    images: v.images || [],
  })) as StoredVariantLean[];
}

function serializeStoredVariants(
  variants: ReadonlyArray<StoredVariantLean>,
  soldByVariant: Map<string, number>,
) {
  return variants.map((v) => {
    const variantId = v._id.toString();
    return {
      _id: variantId,
      size: v.size,
      color: v.color,
      fullStock: v.fullStock,
      stock: v.stock,
      conditionScore: v.conditionScore,
      images: v.images,
      soldQuantity: soldByVariant.get(variantId) || 0,
    };
  });
}

function filterPublicProductMedia<I extends { isPublic?: boolean }, T extends { images: number[] }>(
  images: I[],
  variants: ReadonlyArray<T>,
) {
  const publicEntries = (images || [])
    .map((image, imageIndex) => ({ image, imageIndex }))
    .filter(({ image }) => image.isPublic !== false);
  const publicIndexByOriginal = new Map(
    publicEntries.map(({ imageIndex }, publicIndex) => [imageIndex, publicIndex])
  );
  return {
    images: publicEntries.map(({ image }) => image),
    variants: variants.map((variant) => ({
      ...variant,
      images: (variant.images || [])
        .map((imageIndex) => publicIndexByOriginal.get(imageIndex))
        .filter((imageIndex): imageIndex is number => typeof imageIndex === "number"),
    })),
  };
}

async function getProtectedVariantIds(
  productId: string,
  candidateIds: mongoose.Types.ObjectId[],
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const protectedIds = await Order.distinct("items.variant", {
    "items.product": new mongoose.Types.ObjectId(productId),
    "items.variant": { $in: candidateIds },
    orderStatus: { $in: ACTIVE_ORDER_STATUSES as unknown as string[] },
  });
  return new Set(protectedIds.map((v) => String(v)));
}

async function reconcileVariants(params: {
  productId: string;
  existingVariants: StoredVariantLean[];
  requestedVariants: RequestedVariant[];
  mode: "restock" | "full";
  soldByVariant: Map<string, number>;
}): Promise<NextVariantInput[]> {
  const { productId, existingVariants, requestedVariants, mode, soldByVariant } = params;

  const existingById = new Map<string, StoredVariantLean>();
  for (const v of existingVariants) {
    existingById.set(v._id.toString(), v);
  }

  const requestedIds = new Set<string>();
  const next: NextVariantInput[] = [];

  for (const requested of requestedVariants) {
    const existingId = requested._id && existingById.has(requested._id)
      ? requested._id
      : "";
    const existing = existingId ? existingById.get(existingId)! : null;

    if (existing) {
      requestedIds.add(existingId);
      const sold = soldByVariant.get(existingId) || 0;
      const nextFullStock = mode === "restock"
        ? Math.max(0, existing.fullStock + requested.fullStock)
        : Math.max(0, requested.fullStock);
      next.push({
        _id: existing._id,
        size: requested.size,
        color: requested.color,
        fullStock: nextFullStock,
        stock: Math.max(0, nextFullStock - sold),
        conditionScore:
          requested.conditionScore !== null
            ? requested.conditionScore
            : existing.conditionScore ?? null,
        images: requested.images.length > 0 ? requested.images : existing.images,
      });
    } else {
      // New variant — no sold history.
      next.push({
        size: requested.size,
        color: requested.color,
        fullStock: requested.fullStock,
        stock: requested.fullStock,
        conditionScore: requested.conditionScore,
        images: requested.images,
      });
    }
  }

  // Handle existing variants absent from the payload: soft-delete if any open
  // order references them, otherwise drop.
  const droppedCandidates = existingVariants.filter((v) => !requestedIds.has(v._id.toString()));
  if (droppedCandidates.length > 0) {
    const protectedIds = await getProtectedVariantIds(
      productId,
      droppedCandidates.map((v) => v._id),
    );
    for (const v of droppedCandidates) {
      if (protectedIds.has(v._id.toString())) {
        next.push({
          _id: v._id,
          size: v.size,
          color: v.color,
          fullStock: 0,
          stock: 0,
          conditionScore: v.conditionScore,
          images: v.images,
        });
      }
      // else: truly dropped — omit from next[].
    }
  }

  return next;
}

function canAccessProduct(session: { userId: string; role: string }, product: { createdBy?: { id?: string } | null }) {
  return session.role === "admin" || product.createdBy?.id === session.userId;
}

function buildAdminProductEventPayload(
  product: {
    _id: unknown;
    name?: string | null;
    brand?: string | null;
    reference?: string | null;
    approvalStatus?: string | null;
    createdAt?: Date | string | null;
    updatedAt?: Date | string | null;
    isActive?: boolean | null;
    createdBy?: { id?: string; name?: string; email?: string } | null;
  },
  changeType: "created" | "updated"
) {
  const createdAt =
    product.createdAt instanceof Date ? product.createdAt.toISOString() : String(product.createdAt || "");
  const updatedAt =
    product.updatedAt instanceof Date ? product.updatedAt.toISOString() : String(product.updatedAt || createdAt);

  return {
    type: "product:upsert" as const,
    product: {
      _id: String(product._id),
      name: String(product.name || ""),
      brand: String(product.brand || ""),
      reference: String(product.reference || ""),
      approvalStatus: String(product.approvalStatus || "pending"),
      createdAt,
      updatedAt,
      visibilityStatus: product.isActive === false ? "inactive" : "active",
      isActive: product.isActive !== false,
      changeType,
      createdBy: product.createdBy
        ? {
            id: String(product.createdBy.id || ""),
            name: String(product.createdBy.name || ""),
            email: String(product.createdBy.email || ""),
          }
        : null,
    },
  };
}

async function ensureUniqueProductReference(params: {
  ownerId?: string | null;
  reference: string;
  excludeProductId?: string;
}) {
  const { ownerId, reference, excludeProductId } = params;
  if (!ownerId || !reference) return null;

  const filter: Record<string, unknown> = {
    "createdBy.id": ownerId,
    reference,
  };
  if (excludeProductId) {
    filter._id = { $ne: excludeProductId };
  }

  const existing = await Product.findOne(filter).select("_id").lean();
  if (existing) {
    return NextResponse.json(
      { error: "Reference must be unique within the same store." },
      { status: 409 }
    );
  }

  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "products")) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { id } = await params;
    const product = await Product.findById(id).lean();
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canAccessProduct(session, product)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const variants = getStoredVariants(product);
    const totalStock = sumVariantStock(variants);
    const totalFullStock = sumVariantFullStock(variants);

    const ownerId = product.createdBy?.id ? String(product.createdBy.id) : "";
    const [soldQuantityMap, soldByVariantMap, owner] = await Promise.all([
      getSoldQuantityByProductIds([id]),
      getSoldQuantityByProductAndVariant([id]),
      ownerId ? User.findById(ownerId).select("_id storeName storeType email").lean() : Promise.resolve(null),
    ]);
    const soldQuantity = soldQuantityMap.get(id) || 0;
    const soldByVariant = soldByVariantMap.get(id) || new Map<string, number>();

    const companionSettingsData = product.companionSettings instanceof Map
      ? Object.fromEntries(product.companionSettings)
      : (product.companionSettings && typeof product.companionSettings === "object" ? product.companionSettings : null);

    const responseMedia = { images: product.images, variants };

    return NextResponse.json({
      product: {
        ...product,
        images: responseMedia.images,
        storeName: String(owner?.storeName || ""),
        storeType: owner?.storeType || null,
        stock: totalStock,
        availableStock: totalStock,
        soldQuantity,
        fullStock: totalFullStock,
        variants: serializeStoredVariants(responseMedia.variants, soldByVariant),
        sizes: deriveSizes(variants),
        colors: deriveColors(variants),
        companionSettings: companionSettingsData,
        visibilityStatus: product.isActive === false ? "inactive" : "active",
        availabilityStatus: getAvailabilityStatus({
          productType: product.productType,
          variants,
        }),
        approvalStatus: product.approvalStatus || "approved",
      },
    });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await logRequestStart("admin.products.id.put", req);
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "products")) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { id } = await params;
    const auditActor = await getAuditActorFromSession(session);
    const existingProduct = await Product.findById(id).lean();
    if (!existingProduct) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canAccessProduct(session, existingProduct)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existingVariants = getStoredVariants(existingProduct);
    const soldByVariantMap = await getSoldQuantityByProductAndVariant([id]);
    const soldByVariant = soldByVariantMap.get(id) || new Map<string, number>();

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      if (session.role === "store_owner") {
        const bodyKeys = Object.keys(body || {});
        const isVisibilityOnlyUpdate = bodyKeys.length > 0 && bodyKeys.every((key) => key === "isActive");
        if (!isVisibilityOnlyUpdate) {
          return NextResponse.json({ error: "Store owners cannot edit products after submission." }, { status: 403 });
        }
      }
      if (session.role === "admin") {
        const allowedAdminKeys = new Set([
          "approvalStatus",
          "rejectionReason",
          "isActive",
          "tag",
          "reference",
          "variants",
          "sizeStockMode",
          "fullStock",
          "stock",
        ]);
        const bodyKeys = Object.keys(body || {});
        const hasRestrictedKeys = bodyKeys.some((key) => !allowedAdminKeys.has(key));
        if (hasRestrictedKeys) {
          return NextResponse.json({ error: "Admins cannot edit products." }, { status: 403 });
        }
      }
      const update: Record<string, unknown> = {};
      const sizeStockMode: "restock" | "full" = body.sizeStockMode === "restock" ? "restock" : "full";

      if (typeof body.isActive === "boolean") {
        update.isActive = body.isActive;
      }

      if (session.role === "admin" && typeof body.tag === "string") {
        update.tag = String(body.tag || "").trim();
      }

      if (typeof body.reference === "string") {
        update.reference = normalizeReference(body.reference);
        const duplicateResponse = await ensureUniqueProductReference({
          ownerId: existingProduct.createdBy?.id || session.userId,
          reference: String(update.reference || ""),
          excludeProductId: id,
        });
        if (duplicateResponse) return duplicateResponse;
      }

      const previousApprovalStatus = String(existingProduct.approvalStatus || "approved");
      const shouldNotifyProductApproval =
        session.role === "admin" &&
        (body.approvalStatus === "approved" || body.approvalStatus === "rejected") &&
        body.approvalStatus !== previousApprovalStatus;
      const rejectionReason = String(body.rejectionReason || "").trim();
      if (session.role === "admin" && body.approvalStatus === "rejected" && !rejectionReason) {
        return NextResponse.json({ error: "Please add a rejection reason." }, { status: 400 });
      }

      if (session.role === "admin" && ["pending", "approved", "rejected"].includes(body.approvalStatus)) {
        if (body.approvalStatus === "approved") {
          const approvalError = validateProductApproval({
            ...existingProduct,
            ...update,
          });
          if (approvalError) {
            return NextResponse.json({ error: approvalError }, { status: 400 });
          }
        }
        update.approvalStatus = body.approvalStatus;
      }

      if (Array.isArray(body.variants)) {
        const requestedVariants = parseRequestedVariants(body.variants);
        const nextVariants = await reconcileVariants({
          productId: id,
          existingVariants,
          requestedVariants,
          mode: sizeStockMode,
          soldByVariant,
        });
        const totalStock = sumVariantStock(nextVariants);
        const totalFullStock = sumVariantFullStock(nextVariants);
        update.variants = nextVariants;
        update.stock = totalStock;
        update.fullStock = totalFullStock;
        if (totalStock > 0) update.isActive = true;
      } else if (typeof body.fullStock !== "undefined" || typeof body.stock !== "undefined") {
        // Single-variant convenience path: update fullStock on the sole variant.
        const submittedFullStock =
          typeof body.fullStock !== "undefined" ? body.fullStock : body.stock;
        const rawStock = String(submittedFullStock).trim();
        if (rawStock.length === 0) {
          return NextResponse.json({ error: "Please enter a full stock value." }, { status: 400 });
        }
        const nextFullStock = Number(rawStock);
        if (!Number.isNaN(nextFullStock)) {
          const normalizedFullStock = Math.max(0, nextFullStock);
          const soleVariant = existingVariants[0];
          const sold = soleVariant ? soldByVariant.get(soleVariant._id.toString()) || 0 : 0;
          const defaultVariant = singleDefaultVariant({
            fullStock: normalizedFullStock,
            conditionScore: null,
          });
          const nextVariants: NextVariantInput[] = soleVariant
            ? [{
                _id: soleVariant._id,
                size: soleVariant.size,
                color: soleVariant.color,
                fullStock: normalizedFullStock,
                stock: Math.max(0, normalizedFullStock - sold),
                conditionScore: soleVariant.conditionScore,
                images: soleVariant.images,
              }]
            : [{
                size: defaultVariant.size,
                color: defaultVariant.color,
                fullStock: defaultVariant.fullStock,
                stock: normalizedFullStock,
                conditionScore: defaultVariant.conditionScore,
                images: defaultVariant.images,
              }];
          update.variants = nextVariants;
          update.fullStock = sumVariantFullStock(nextVariants);
          update.stock = sumVariantStock(nextVariants);
          if (update.stock as number > 0) {
            update.isActive = true;
          }
        }
      }
      update.updatedBy = auditActor;

      const product = await Product.findByIdAndUpdate(id, update, { new: true }).lean();
      if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (shouldNotifyProductApproval) {
        const recipientEmail = String(existingProduct.createdBy?.email || "").trim();
        if (recipientEmail) {
          try {
            const owner = existingProduct.createdBy?.id
              ? await User.findById(existingProduct.createdBy.id).select("storeName").lean()
              : null;
            await sendProductApprovalStatusEmail({
              to: recipientEmail,
              name: String(existingProduct.createdBy?.name || "Store owner"),
              storeName: String(owner?.storeName || existingProduct.createdBy?.name || "Your store"),
              productName: String(product.name || existingProduct.name || "Product"),
              status: body.approvalStatus,
              reason: body.approvalStatus === "rejected" ? rejectionReason : "",
              imageUrl: getProductEmailImageUrl(product),
              productUrl: `${(process.env.ADMIN_BASE_URL || "http://localhost:3001").replace(/\/$/, "")}/dashboard/products/${id}`,
            });
          } catch (emailError) {
            console.error("Product approval status email error:", emailError);
          }
        }
      }
      const variants = getStoredVariants(product);
      const updatedSoldByVariantMap = await getSoldQuantityByProductAndVariant([id]);
      const updatedSoldByVariant = updatedSoldByVariantMap.get(id) || new Map<string, number>();

      return NextResponse.json({
        product: {
          ...product,
          stock: sumVariantStock(variants),
          availableStock: sumVariantStock(variants),
          fullStock: sumVariantFullStock(variants),
          variants: serializeStoredVariants(variants, updatedSoldByVariant),
          sizes: deriveSizes(variants),
          colors: deriveColors(variants),
          visibilityStatus: product.isActive === false ? "inactive" : "active",
          availabilityStatus: getAvailabilityStatus({
            productType: product.productType,
            variants,
          }),
          approvalStatus: product.approvalStatus || "approved",
        },
      });
    }

    // Store-owner restricted edit: name, price, and appended hidden pictures only.
    if (session.role === "store_owner") {
      const formData = await req.formData();
      const allowedKeys = new Set(["name", "price", "images"]);
      const hasRestrictedKeys = Array.from(formData.keys()).some((key) => !allowedKeys.has(key));
      if (hasRestrictedKeys) {
        return NextResponse.json({ error: "Store owners can only edit name, price, and add pictures." }, { status: 403 });
      }

      const name = String(formData.get("name") || "").trim();
      const price = Number(formData.get("price") || 0);
      if (!name) {
        return NextResponse.json({ error: "Product name is required." }, { status: 400 });
      }
      if (!Number.isFinite(price) || price <= 0) {
        return NextResponse.json({ error: "Please enter a valid price." }, { status: 400 });
      }

      const imageFiles = formData
        .getAll("images")
        .filter((value): value is File => value instanceof File && value.size > 0);
      const newImagePaths = await saveProductImages(imageFiles);
      const existingImages = (existingProduct.images || []).filter((image) => Boolean(image && image.url));
      const images = [
        ...existingImages,
        ...newImagePaths.map((url) => ({
          url,
          isMain: false,
          isPublic: false,
          source: "store_owner_edit",
          color: null,
          sourceKey: "store-owner-added",
          gender: null,
        })),
      ];

      const product = await Product.findByIdAndUpdate(
        id,
        {
          name,
          price,
          images,
          approvalStatus: "pending",
          updatedBy: auditActor,
        },
        { new: true }
      ).lean();
      if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const variants = getStoredVariants(product);
      const finalSoldByVariantMap = await getSoldQuantityByProductAndVariant([id]);
      const finalSoldByVariant = finalSoldByVariantMap.get(id) || new Map<string, number>();
      const response = NextResponse.json({
        product: {
          ...product,
          stock: sumVariantStock(variants),
          availableStock: sumVariantStock(variants),
          fullStock: sumVariantFullStock(variants),
          variants: serializeStoredVariants(variants, finalSoldByVariant),
          sizes: deriveSizes(variants),
          colors: deriveColors(variants),
          visibilityStatus: product.isActive === false ? "inactive" : "active",
          availabilityStatus: getAvailabilityStatus({
            productType: product.productType,
            variants,
          }),
          approvalStatus: product.approvalStatus || "approved",
        },
      });
      broadcastAdminEvent(buildAdminProductEventPayload(product, "updated"));
      return response;
    }

    // Multipart full edit.
    const formData = await req.formData();
    const existingImages = JSON.parse(String(formData.get("existingImages") || "[]")) as { url: string }[];
    const imageOrder = JSON.parse(String(formData.get("imageOrder") || "[]")) as string[];
    const imageMeta = JSON.parse(String(formData.get("imageMeta") || "{}")) as Record<string, {
      isPublic?: boolean;
      source?: string;
      color?: string | null;
      sourceKey?: string;
      gender?: "men" | "women" | null;
    }>;
    const imageFiles = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0);
    const cloneSourceImageFile = formData.get("cloneSourceImageFile");
    const originPictureFiles = {
      front: formData.get("originPictureFrontFile"),
      back: formData.get("originPictureBackFile"),
      left: formData.get("originPictureLeftFile"),
      right: formData.get("originPictureRightFile"),
    };
    const newImagePaths = await saveProductImages(imageFiles);
    const newCloneSourceImagePath =
      cloneSourceImageFile instanceof File && cloneSourceImageFile.size > 0
        ? (await saveProductImages([cloneSourceImageFile]))[0]
        : "";
    const newOriginPictures = {
      front:
        originPictureFiles.front instanceof File && originPictureFiles.front.size > 0
          ? (await saveProductImages([originPictureFiles.front]))[0]
          : String(formData.get("originPictureFront") || ""),
      back:
        originPictureFiles.back instanceof File && originPictureFiles.back.size > 0
          ? (await saveProductImages([originPictureFiles.back]))[0]
          : String(formData.get("originPictureBack") || ""),
      left:
        originPictureFiles.left instanceof File && originPictureFiles.left.size > 0
          ? (await saveProductImages([originPictureFiles.left]))[0]
          : String(formData.get("originPictureLeft") || ""),
      right:
        originPictureFiles.right instanceof File && originPictureFiles.right.size > 0
          ? (await saveProductImages([originPictureFiles.right]))[0]
          : String(formData.get("originPictureRight") || ""),
    };
    const mainImageKey = String(formData.get("mainImageKey") || "");
    const productType = normalizeProductType(String(formData.get("productType") || "fashion"));
    const fashionSubtype =
      productType === "fashion" ? String(formData.get("fashionSubtype") || "clothes") : null;
    const explicitConditionScore =
      productType === "perfume" ? Number(formData.get("conditionScore") || 9) : null;
    const rawFullStock = String(formData.get("fullStock") ?? formData.get("stock") ?? "").trim();
    if (rawFullStock.length === 0) {
      return NextResponse.json({ error: "Please enter a full stock value." }, { status: 400 });
    }
    const nextFullStock = Math.max(0, Number(rawFullStock));

    const existingImageMap = new Map(
      existingImages.map((image) => [`existing:${image.url}`, image.url])
    );
    const newImageMap = new Map(
      newImagePaths.map((url, index) => [`new:${index}`, url])
    );
    const orderedKeys = imageOrder.length > 0 ? imageOrder : [...existingImageMap.keys(), ...newImageMap.keys()];
    const mergedImages = orderedKeys
      .map((key) => {
        const url = existingImageMap.get(key) || newImageMap.get(key);
        return url ? { url, isMain: false, key, meta: imageMeta[key] || {} } : null;
      })
      .filter(Boolean) as { url: string; isMain: boolean; key: string; meta: Record<string, unknown> }[];

    const existingProductImages = (existingProduct.images || []).filter((image) => Boolean(image && image.url));
    const nextImages =
      mergedImages.length > 0
        ? mergedImages
        : existingProductImages.map((image, index) => ({
            url: image.url,
            isMain: Boolean(image.isMain),
            meta: {
              isPublic: image.isPublic !== false,
              source: image.source || "",
              color: image.color || null,
              sourceKey: image.sourceKey || "",
              gender: image.gender || null,
            },
            key: `existing:${image.url}:${index}`,
          }));

    if (nextImages.length === 0) {
      return NextResponse.json({ error: "Please keep or upload at least one product image." }, { status: 400 });
    }

    const selectedKey = nextImages.some((image) => image.key === mainImageKey)
      ? mainImageKey
      : nextImages[0].key;

    const images = nextImages.map(({ key, url, isMain, meta }) => ({
      url,
      isMain: mergedImages.length > 0 ? key === selectedKey : Boolean(isMain),
      isPublic: meta.isPublic !== false,
      source: String(meta.source || ""),
      color: meta.color ? String(meta.color) : null,
      sourceKey: String(meta.sourceKey || ""),
      gender: meta.gender === "men" || meta.gender === "women" ? meta.gender : null,
    }));

    const removedImages = mergedImages.length > 0
      ? (existingProduct.images || [])
          .map((image) => image.url)
          .filter((url) => !existingImages.some((image) => image.url === url))
      : [];

    const requestedVariants: RequestedVariant[] =
      productType === "perfume"
        ? [singleDefaultVariant({ fullStock: nextFullStock, conditionScore: explicitConditionScore })]
        : (() => {
            const parsed = parseRequestedVariants(formData.get("variants"));
            return parsed.length > 0
              ? parsed
              : [singleDefaultVariant({ fullStock: nextFullStock, conditionScore: null })];
          })();

    const nextVariants = await reconcileVariants({
      productId: id,
      existingVariants,
      requestedVariants,
      mode: "full",
      soldByVariant,
    });
    const totalStock = sumVariantStock(nextVariants);
    const totalFullStock = sumVariantFullStock(nextVariants);

    const conditionScore = explicitConditionScore !== null
      ? explicitConditionScore
      : averageVariantConditionScore(nextVariants);

    const reference = normalizeReference(formData.get("reference"));
    const duplicateResponse = await ensureUniqueProductReference({
      ownerId: existingProduct.createdBy?.id || session.userId,
      reference,
      excludeProductId: id,
    });
    if (duplicateResponse) return duplicateResponse;

    const body = {
      name: String(formData.get("name") || ""),
      price: Number(formData.get("price") || 0),
      isActive: formData.has("isActive")
        ? String(formData.get("isActive") || "true") === "true"
        : existingProduct.isActive !== false,
      categories: parseStringArray(formData.get("categories")),
      ...(["men", "women", "children", "unisex"].includes(
        String(formData.get("gender") || "")
      )
        ? { gender: String(formData.get("gender")) }
        : {}),
      description: String(formData.get("description") || ""),
      brand: String(formData.get("brand") || "LOOKSMAX"),
      reference,
      tag: String(formData.get("tag") || ""),
      newTagDurationDays: Math.max(1, Math.floor(Number(formData.get("newTagDurationDays") || 3)) || 3),
      productType,
      fashionSubtype,
      conditionStatus:
        conditionScore === null ? null : getConditionStatusFromScore(conditionScore),
      conditionScore,
      fullStock: totalFullStock,
      stock: totalStock,
      variants: nextVariants,
      originPictures: normalizeOriginPictures(productType, fashionSubtype, newOriginPictures),
      cloneSourceName: productType === "perfume" ? String(formData.get("cloneSourceName") || "") : "",
      cloneSourceImage:
        productType === "perfume"
          ? newCloneSourceImagePath || String(formData.get("cloneSourceImage") || "")
          : "",
      modelId: String(formData.get("modelId") || ""),
      companionSettings: parseCompanionSettings(formData.get("companionSettings")),
      images,
      approvalStatus: "pending",
      updatedBy: auditActor,
    };

    if (totalStock > 0) {
      body.isActive = true;
    }

    const product = await Product.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const deleteCandidates: string[] = [...removedImages];
    if (
      newCloneSourceImagePath &&
      existingProduct.cloneSourceImage &&
      existingProduct.cloneSourceImage !== newCloneSourceImagePath
    ) {
      deleteCandidates.push(existingProduct.cloneSourceImage);
    }
    for (const side of ["front", "back", "left", "right"] as const) {
      const previous = existingProduct.originPictures?.[side] || "";
      const next = body.originPictures?.[side] || "";
      if (previous && previous !== next) {
        deleteCandidates.push(previous);
      }
    }
    await deleteUnreferencedProductImages({
      productId: id,
      candidateUrls: deleteCandidates,
      keptUrls: [
        ...images.map((image) => image.url),
        body.originPictures.front,
        body.originPictures.back,
        body.originPictures.left,
        body.originPictures.right,
        body.cloneSourceImage,
      ],
    });

    const variants = getStoredVariants(product);
    const finalSoldByVariantMap = await getSoldQuantityByProductAndVariant([id]);
    const finalSoldByVariant = finalSoldByVariantMap.get(id) || new Map<string, number>();

    const response = NextResponse.json({
      product: {
        ...product,
        stock: sumVariantStock(variants),
        availableStock: sumVariantStock(variants),
        fullStock: sumVariantFullStock(variants),
        variants: serializeStoredVariants(variants, finalSoldByVariant),
        sizes: deriveSizes(variants),
        colors: deriveColors(variants),
        visibilityStatus: product.isActive === false ? "inactive" : "active",
        availabilityStatus: getAvailabilityStatus({
          productType: product.productType,
          variants,
        }),
        approvalStatus: product.approvalStatus || "approved",
      },
    });
    broadcastAdminEvent(buildAdminProductEventPayload(product, "updated"));
    return response;
  } catch (error) { logRequestError("admin.products.id.put", req, error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "products")) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { id } = await params;
    const product = await Product.findById(id).lean();
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canAccessProduct(session, product)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await Product.findByIdAndDelete(id);
    broadcastAdminEvent({ type: "product:delete", productId: id });
    return NextResponse.json({ success: true });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
