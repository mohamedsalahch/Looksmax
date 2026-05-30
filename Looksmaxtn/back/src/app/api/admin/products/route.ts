import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
import { saveProductImages } from "@/admin/lib/productUploads";
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
    const webhookUrl = new URL("/api/admin/notifications/webhook", req.url);
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
    const soldQuantityMap = await getSoldQuantityByProductIds(productIds);

    return NextResponse.json({
      products: products.map((product) => {
        const productId = product._id.toString();
        const soldQuantity = soldQuantityMap.get(productId) || 0;
        const variants = normalizeStoredVariants(product.variants) as StoredVariantLean[];
        const totalStock = sumVariantStock(variants);
        const totalFullStock = sumVariantFullStock(variants);

        return {
          ...product,
          stock: totalStock,
          availableStock: totalStock,
          soldQuantity,
          fullStock: totalFullStock,
          variants: serializeStoredVariants(variants),
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
    if (session.role === "store_owner") {
      const validationError = validateStoreOwnerSubmission({
        formData,
        imageCount: imageFiles.length,
        variants: requestedVariants,
      });
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
    }

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

    const product = await Product.create({
      name: session.role === "store_owner" ? "" : String(formData.get("name") || ""),
      price: Number(formData.get("price") || 0),
      isActive: String(formData.get("isActive") || "true") === "true",
      categories: session.role === "store_owner" ? [] : parseStringArray(formData.get("categories")),
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
      })),
      approvalStatus: session.role === "store_owner" ? "pending" : "approved",
      createdBy: auditActor,
      updatedBy: auditActor,
    });
    if (session.role === "store_owner") {
      await notifyAdminProductCreated(req, product.toObject());
    }
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) { logRequestError("admin.products.post", req, error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
