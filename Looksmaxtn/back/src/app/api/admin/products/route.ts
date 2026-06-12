import { NextRequest, NextResponse, after } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import User from "@/admin/models/User";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
import { saveProductImages } from "@/admin/lib/productUploads";
import { inferNameAndCategory } from "@/admin/lib/productInference";
import { getConditionStatusFromScore } from "@/admin/lib/productCondition";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";
import { getSoldQuantityByProductIds } from "@/lib/productInventory";
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
  _id: { toString(): string };
  size: string;
  color: string | null;
  fullStock: number;
  stock: number;
  conditionScore: number | null;
  images: number[];
};

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

function normalizeReference(value: unknown) {
  return String(value || "").trim();
}

function validateStoreOwnerSubmission(params: {
  formData: FormData;
  imageCount: number;
  variants: RequestedVariant[];
}) {
  const price = Number(params.formData.get("price") || 0);
  if (!Number.isFinite(price) || price <= 0) {
    return "Please enter a valid product price.";
  }
  if (params.imageCount < 2) {
    return "Please upload at least 2 pictures and include front and back views.";
  }
  if (params.variants.length === 0) {
    return "Please add at least one colorway with size and quantity.";
  }

  for (const variant of params.variants) {
    if (!variant.size.trim()) return "Please add a size for every colorway quantity.";
    if (variant.fullStock <= 0) return "Please add a quantity greater than zero for every size.";
    const images = new Set<number>();
    for (const imageIndex of variant.images) {
      if (imageIndex < 0 || imageIndex >= params.imageCount) {
        return "Invalid colorway image selection.";
      }
      images.add(imageIndex);
    }
    if (images.size < 2) return "Please upload at least 2 pictures for each colorway, including front and back views.";
  }

  return "";
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

function getRequestedVariants(
  formData: FormData,
  options: { productType: string; fullStock: number; explicitConditionScore: number | null }
): RequestedVariant[] {
  if (options.productType === "perfume") {
    return [singleDefaultVariant({
      fullStock: options.fullStock,
      conditionScore: options.explicitConditionScore,
    })];
  }

  const parsed = parseRequestedVariants(formData.get("variants"));
  if (parsed.length > 0) return parsed;

  return [singleDefaultVariant({
    fullStock: options.fullStock,
    conditionScore: null,
  })];
}

function serializeStoredVariants(variants: ReadonlyArray<StoredVariantLean>) {
  return variants.map((v) => ({
    _id: v._id.toString(),
    size: v.size,
    color: v.color,
    fullStock: v.fullStock,
    stock: v.stock,
    conditionScore: v.conditionScore,
    images: v.images,
  }));
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

async function ensureUniqueProductReference(params: {
  ownerId?: string | null;
  reference: string;
}) {
  const { ownerId, reference } = params;
  if (!ownerId || !reference) return null;

  const existing = await Product.findOne({
    "createdBy.id": ownerId,
    reference,
  })
    .select("_id")
    .lean();

  if (existing) {
    return NextResponse.json(
      { error: "Reference must be unique within the same store." },
      { status: 409 }
    );
  }

  return null;
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

async function notifyAdminProductCreated(req: NextRequest, product: {
  _id: unknown;
  name?: string | null;
  brand?: string | null;
  reference?: string | null;
  approvalStatus?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  isActive?: boolean | null;
  createdBy?: { id?: string; name?: string; email?: string } | null;
}) {
  const webhookSecret = process.env.OUTFIT_WEBHOOK_SECRET || "";
  const payload = buildAdminProductEventPayload(product, "created");

  try {
    // Prefer the explicitly configured base; `req.url` can be https on prod while
    // the internal server only speaks http (ERR_SSL_WRONG_VERSION_NUMBER).
    const webhookBaseUrl = (process.env.OUTFIT_WEBHOOK_BASE_URL || req.nextUrl.origin).replace(/\/$/, "");
    const webhookUrl = `${webhookBaseUrl}/api/admin/notifications/webhook`;
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn("[admin-notifications-webhook] Failed to send product notification", await response.text());
      broadcastAdminEvent(payload);
    }
  } catch (error) {
    console.error("[admin-notifications-webhook] Product notification error:", error);
    broadcastAdminEvent(payload);
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "products")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const category = searchParams.get("category");

    const filter: Record<string, unknown> = {};
    if (session.role === "store_owner") filter["createdBy.id"] = session.userId;
    if (category) filter.categories = category;
    if (search) filter.name = { $regex: search, $options: "i" };

    const products = await Product.find(filter).sort({ createdAt: -1 }).lean();
    const productIds = products.map((product) => product._id.toString());
    const ownerIds = [...new Set(
      products
        .map((product) => product.createdBy?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )];
    const [soldQuantityMap, owners] = await Promise.all([
      getSoldQuantityByProductIds(productIds),
      ownerIds.length > 0
        ? User.find({ _id: { $in: ownerIds } }).select("_id storeName email").lean()
        : Promise.resolve([]),
    ]);
    const ownerMap = new Map(owners.map((owner) => [owner._id.toString(), owner]));

    return NextResponse.json({
      products: products.map((product) => {
        const productId = product._id.toString();
        const soldQuantity = soldQuantityMap.get(productId) || 0;
        const variants = normalizeStoredVariants(product.variants) as StoredVariantLean[];
        const responseMedia = { images: product.images, variants };
        const totalStock = sumVariantStock(variants);
        const totalFullStock = sumVariantFullStock(variants);
        const owner = product.createdBy?.id ? ownerMap.get(product.createdBy.id) : null;

        return {
          ...product,
          storeName: String(owner?.storeName || ""),
          images: responseMedia.images,
          stock: totalStock,
          availableStock: totalStock,
          soldQuantity,
          fullStock: totalFullStock,
          variants: serializeStoredVariants(responseMedia.variants),
          sizes: deriveSizes(variants),
          colors: deriveColors(variants),
          availabilityStatus: getAvailabilityStatus({
            productType: product.productType,
            variants,
          }),
          approvalStatus: product.approvalStatus || "approved",
          visibilityStatus: product.isActive === false ? "inactive" : "active",
        };
      }),
    });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    await logRequestStart("admin.products.post", req);
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "products")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (session.role === "admin") {
      return NextResponse.json({ error: "Admins cannot add products." }, { status: 403 });
    }

    await dbConnect();
    const auditActor = await getAuditActorFromSession(session);
    const formData = await req.formData();
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

    if (imageFiles.length === 0) {
      return NextResponse.json({ error: "Please upload at least one product image." }, { status: 400 });
    }

    const rawFullStock = String(formData.get("fullStock") ?? formData.get("stock") ?? "").trim();
    if (rawFullStock.length === 0) {
      return NextResponse.json({ error: "Please enter a full stock value." }, { status: 400 });
    }
    const fullStock = Math.max(0, Number(rawFullStock));
    const productType = session.role === "store_owner"
      ? "fashion"
      : normalizeProductType(String(formData.get("productType") || "fashion"));
    const fashionSubtype =
      productType === "fashion"
        ? session.role === "store_owner"
          ? "clothes"
          : String(formData.get("fashionSubtype") || "clothes")
        : null;
    const explicitConditionScore =
      productType === "perfume" ? Number(formData.get("conditionScore") || 9) : null;
    const requestedVariants = getRequestedVariants(formData, {
      productType,
      fullStock,
      explicitConditionScore,
    });
    const inferenceGender = String(formData.get("gender") || "").trim().toLowerCase();
    if (session.role === "store_owner") {
      const validationError = validateStoreOwnerSubmission({
        formData,
        imageCount: imageFiles.length,
        variants: requestedVariants,
      });
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
      if (!["men", "women", "children", "unisex"].includes(inferenceGender)) {
        return NextResponse.json(
          { error: "Please select a gender (men, women, children, or unisex)." },
          { status: 400 }
        );
      }
    }

    // Capture the first picture as base64 for background name/category inference.
    const inferenceImageB64 =
      session.role === "store_owner" && imageFiles[0]
        ? Buffer.from(await imageFiles[0].arrayBuffer()).toString("base64")
        : "";

    const imagePaths = await saveProductImages(imageFiles);
    const cloneSourceImagePath =
      cloneSourceImageFile instanceof File && cloneSourceImageFile.size > 0
        ? (await saveProductImages([cloneSourceImageFile]))[0]
        : "";
    const originPictures = {
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
    const mainImageIndex = Math.max(0, Number(formData.get("mainImageIndex") ?? 0));

    // On create there are no prior orders — stock = fullStock for each variant.
    const variants = requestedVariants.map((v) => ({
      size: v.size,
      color: v.color,
      fullStock: v.fullStock,
      stock: v.fullStock,
      conditionScore: v.conditionScore,
      images: v.images,
    }));

    const conditionScore =
      explicitConditionScore !== null
        ? explicitConditionScore
        : averageVariantConditionScore(variants);

    const reference = session.role === "store_owner" ? "" : normalizeReference(formData.get("reference"));
    const duplicateResponse = await ensureUniqueProductReference({
      ownerId: auditActor?.id,
      reference,
    });
    if (duplicateResponse) return duplicateResponse;

    let tag = String(formData.get("tag") || "");
    let newTagDurationDays = Math.max(1, Math.floor(Number(formData.get("newTagDurationDays") || 3)) || 3);
    if (session.role === "store_owner") {
      tag = "NEW";
      newTagDurationDays = 3;
    }

    const totalStock = sumVariantStock(variants);
    const totalFullStock = sumVariantFullStock(variants);

    let ownerApproved = true;
    if (session.role === "store_owner") {
      const creator = await User.findById(session.userId)
        .select("storeApprovalStatus")
        .lean();
      ownerApproved = !creator?.storeApprovalStatus || creator.storeApprovalStatus === "approved";
    }

    const product = await Product.create({
      name: session.role === "store_owner" ? "" : String(formData.get("name") || ""),
      price: Number(formData.get("price") || 0),
      isActive: String(formData.get("isActive") || "true") === "true",
      categories: session.role === "store_owner" ? [] : parseStringArray(formData.get("categories")),
      gender: session.role === "store_owner" ? inferenceGender : null,
      description: session.role === "store_owner" ? "" : String(formData.get("description") || ""),
      brand: String(formData.get("brand") || ""),
      reference,
      stock: totalStock,
      fullStock: totalFullStock,
      variants,
      tag,
      newTagDurationDays,
      productType,
      fashionSubtype,
      conditionStatus:
        session.role === "store_owner" || conditionScore === null ? null : getConditionStatusFromScore(conditionScore),
      conditionScore: session.role === "store_owner" ? null : conditionScore,
      originPictures: session.role === "store_owner"
        ? normalizeOriginPictures(productType, fashionSubtype, {
            front: imagePaths[0] || "",
            back: imagePaths[1] || "",
          })
        : normalizeOriginPictures(productType, fashionSubtype, originPictures),
      cloneSourceName: productType === "perfume" ? String(formData.get("cloneSourceName") || "") : "",
      cloneSourceImage:
        productType === "perfume" ? cloneSourceImagePath || String(formData.get("cloneSourceImage") || "") : "",
      modelId: session.role === "store_owner" ? "" : String(formData.get("modelId") || ""),
      companionSettings: session.role === "store_owner" ? null : parseCompanionSettings(formData.get("companionSettings")),
      images: imagePaths.map((url, index) => ({
        url,
        isMain: index === Math.min(mainImageIndex, imagePaths.length - 1),
        isPublic: session.role !== "store_owner",
        source: "original",
        color: null,
        sourceKey: `originalOther:${index}`,
      })),
      approvalStatus: session.role === "store_owner" ? "pending" : "approved",
      ownerApproved,
      createdBy: auditActor,
      updatedBy: auditActor,
    });
    if (session.role === "store_owner") {
      // Submit returns immediately. Name/category are inferred in the background;
      // the admin notification is sent once inference finishes (or fails).
      const productId = String(product._id);
      after(async () => {
        try {
          const inferred = await inferNameAndCategory({
            gender: inferenceGender,
            imageB64: inferenceImageB64,
          });
          if (inferred) {
            await Product.findByIdAndUpdate(productId, {
              name: inferred.name,
              categories: inferred.categories,
            });
          }
        } catch (error) {
          console.error("[admin.products.post] inference failed:", error);
        }
        try {
          const fresh = await Product.findById(productId).lean();
          if (fresh) await notifyAdminProductCreated(req, fresh);
        } catch (error) {
          console.error("[admin.products.post] notify failed:", error);
        }
      });
    }
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) { logRequestError("admin.products.post", req, error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
