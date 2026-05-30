import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import Order from "@/admin/models/Order";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
import { deleteProductImage, saveProductImages } from "@/admin/lib/productUploads";
import { getConditionStatusFromScore } from "@/admin/lib/productCondition";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";
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
    if (session.role === "store_owner" && (product.approvalStatus || "approved") !== "approved") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const variants = getStoredVariants(product);
    const totalStock = sumVariantStock(variants);
    const totalFullStock = sumVariantFullStock(variants);

    const [soldQuantityMap, soldByVariantMap] = await Promise.all([
      getSoldQuantityByProductIds([id]),
      getSoldQuantityByProductAndVariant([id]),
    ]);
    const soldQuantity = soldQuantityMap.get(id) || 0;
    const soldByVariant = soldByVariantMap.get(id) || new Map<string, number>();

    const companionSettingsData = product.companionSettings instanceof Map
      ? Object.fromEntries(product.companionSettings)
      : (product.companionSettings && typeof product.companionSettings === "object" ? product.companionSettings : null);

    return NextResponse.json({
      product: {
        ...product,
        stock: totalStock,
        availableStock: totalStock,
        soldQuantity,
        fullStock: totalFullStock,
        variants: serializeStoredVariants(variants, soldByVariant),
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

    // Multipart full edit.
    if (session.role === "store_owner") {
      return NextResponse.json({ error: "Store owners cannot edit products after submission." }, { status: 403 });
    }
    const formData = await req.formData();
    const existingImages = JSON.parse(String(formData.get("existingImages") || "[]")) as { url: string }[];
    const imageOrder = JSON.parse(String(formData.get("imageOrder") || "[]")) as string[];
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
        return url ? { url, isMain: false, key } : null;
      })
      .filter(Boolean) as { url: string; isMain: boolean; key: string }[];

    const existingProductImages = (existingProduct.images || []).filter((image) => Boolean(image && image.url));
    const nextImages =
      mergedImages.length > 0
        ? mergedImages
        : existingProductImages.map((image, index) => ({
            url: image.url,
            isMain: Boolean(image.isMain),
            key: `existing:${image.url}:${index}`,
          }));

    if (nextImages.length === 0) {
      return NextResponse.json({ error: "Please keep or upload at least one product image." }, { status: 400 });
    }

    const selectedKey = nextImages.some((image) => image.key === mainImageKey)
      ? mainImageKey
      : nextImages[0].key;

    const images = nextImages.map(({ key, url, isMain }) => ({
      url,
      isMain: mergedImages.length > 0 ? key === selectedKey : Boolean(isMain),
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
      approvalStatus: session.role === "store_owner" ? "pending" : existingProduct.approvalStatus || "approved",
      updatedBy: auditActor,
    };

    if (totalStock > 0) {
      body.isActive = true;
    }

    const product = await Product.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await Promise.all(removedImages.map((imagePath) => deleteProductImage(imagePath)));
    if (
      newCloneSourceImagePath &&
      existingProduct.cloneSourceImage &&
      existingProduct.cloneSourceImage !== newCloneSourceImagePath
    ) {
      await deleteProductImage(existingProduct.cloneSourceImage);
    }
    const previousOriginPictures: Record<"front" | "back" | "left" | "right", string> = {
      front: existingProduct.originPictures?.front || "",
      back: existingProduct.originPictures?.back || "",
      left: existingProduct.originPictures?.left || "",
      right: existingProduct.originPictures?.right || "",
    };
    const nextOriginPicturesMap: Record<"front" | "back" | "left" | "right", string> = {
      front: body.originPictures?.front || "",
      back: body.originPictures?.back || "",
      left: body.originPictures?.left || "",
      right: body.originPictures?.right || "",
    };
    await Promise.all(
      (["front", "back", "left", "right"] as const).map(async (key) => {
        const previous = previousOriginPictures[key];
        const next = nextOriginPicturesMap[key];
        if (previous && previous !== next) {
          await deleteProductImage(previous);
        }
      })
    );

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
