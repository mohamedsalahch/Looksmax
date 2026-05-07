import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
import { deleteProductImage, saveProductImages } from "@/admin/lib/productUploads";
import { getConditionStatusFromScore } from "@/admin/lib/productCondition";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";
import { getSoldQuantityByProductAndSize, getSoldQuantityByProductIds } from "@/lib/productInventory";

function getSizeStockEntries(
  sizeStock: unknown
): Array<[string, { fullStock?: number; stock?: number; conditionScore?: number | null }]> {
  if (sizeStock instanceof Map) {
    return Array.from(sizeStock.entries());
  }

  if (!sizeStock || typeof sizeStock !== "object") return [];

  return Object.entries(sizeStock as Record<string, { fullStock?: number; stock?: number; conditionScore?: number | null }>);
}

function getAvailabilityStatus(params: {
  productType?: string;
  stock: number;
  sizeStock?: unknown;
}) {
  const { productType, stock, sizeStock } = params;
  const sizeStockEntries = getSizeStockEntries(sizeStock);
  const hasSelectableSize = sizeStockEntries.length > 0
    ? sizeStockEntries.some(([, entry]) => Math.max(entry.stock ?? 0, 0) > 0)
    : stock > 0;
  const effectiveStock = sizeStockEntries.length > 0
    ? sizeStockEntries.reduce((sum, [, entry]) => sum + Math.max(entry.stock ?? 0, 0), 0)
    : stock;

  if (!hasSelectableSize) return "out-of-stock";
  if (productType === "perfume" && effectiveStock <= 3) return "low-stock";
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

function getInventorySnapshot(
  product: { stock?: number; fullStock?: number; sizeStock?: unknown },
  soldQuantity: number
) {
  const sizeStockEntries = getSizeStockEntries(product.sizeStock);
  const hasSizeStock = sizeStockEntries.length > 0;
  const availableStock = hasSizeStock
    ? sizeStockEntries.reduce((sum, [, entry]) => sum + Math.max(entry.stock ?? 0, 0), 0)
    : Math.max(product.stock ?? 0, 0);
  const fullStock = hasSizeStock
    ? sizeStockEntries.reduce((sum, [, entry]) => sum + Math.max(entry.fullStock ?? entry.stock ?? 0, 0), 0)
    : typeof product.fullStock === "number"
      ? Math.max(product.fullStock, 0)
      : Math.max(availableStock + soldQuantity, 0);

  return { availableStock, fullStock, soldQuantity };
}

function parseCompanionSettings(raw: FormDataEntryValue | null) {
  const str = String(raw || "").trim();
  if (!str || str === "{}") return null;
  try {
    const parsed = JSON.parse(str) as Record<string, {
      topType?: string; topColor?: { name: string; hex: string } | null;
      bottomType?: string; bottomColor?: { name: string; hex: string } | null;
      footwearType?: string; footwearColor?: { name: string; hex: string } | null;
    }>;
    return new Map(Object.entries(parsed));
  } catch { return null; }
}

function parseProductVariants(raw: FormDataEntryValue | null) {
  const str = String(raw || "").trim();
  if (!str || str === "[]") return [];
  try {
    const parsed = JSON.parse(str) as Array<{
      key?: string;
      size?: string;
      color?: string;
      fullStock?: number;
      stock?: number;
      conditionScore?: number | null;
    }>;
    return parsed
      .map((variant) => {
        const key = String(variant.key || "").trim();
        const size = String(variant.size || "").trim();
        const color = String(variant.color || "").trim();
        if (!key || !size) return null;
        return {
          key,
          size,
          color,
          fullStock: Math.max(0, Number(variant.fullStock ?? variant.stock ?? 0) || 0),
          stock: Math.max(0, Number(variant.stock ?? variant.fullStock ?? 0) || 0),
          conditionScore:
            variant.conditionScore == null
              ? null
              : Math.max(0, Math.min(10, Number(variant.conditionScore) || 0)),
        };
      })
      .filter((variant): variant is NonNullable<typeof variant> => variant !== null);
  } catch {
    return [];
  }
}

function normalizeReference(value: unknown) {
  return String(value || "").trim();
}

function getDeclaredSizes(productSizes: unknown, bodySizes?: unknown) {
  const sizes = new Set<string>();
  for (const source of [productSizes, bodySizes]) {
    if (!Array.isArray(source)) continue;
    for (const size of source) {
      if (typeof size !== "string") continue;
      const normalized = size.trim();
      if (normalized) sizes.add(normalized);
    }
  }
  return Array.from(sizes);
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

function buildSizeStockSnapshot(params: {
  sizeStock?: unknown;
  sizes: string[];
  soldBySize: Map<string, number>;
}) {
  const { sizeStock, sizes, soldBySize } = params;
  if (!sizeStock && sizes.length === 0) return null;

  const snapshot: Record<string, { fullStock: number; stock: number; soldQuantity: number; conditionScore: number | null }> = {};
  const sizeStockEntries = new Map(getSizeStockEntries(sizeStock));
  const orderedSizes = Array.from(
    new Set([
      ...sizes,
      ...Array.from(sizeStockEntries.keys()),
    ])
  );

  if (orderedSizes.length === 0) return null;

  for (const size of orderedSizes) {
    const entry = sizeStockEntries.get(size);
    snapshot[size] = {
      fullStock: Math.max(entry?.fullStock ?? 0, 0),
      stock: Math.max(entry?.stock ?? 0, 0),
      soldQuantity: Math.max(soldBySize.get(size) || 0, 0),
      conditionScore: typeof entry?.conditionScore === "number"
        ? Math.max(0, Math.min(10, Number(entry.conditionScore) || 0))
        : null,
    };
  }

  return snapshot;
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "products")) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { id } = await params;
    const product = await Product.findById(id).lean();
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canAccessProduct(session, product)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const soldQuantityMap = await getSoldQuantityByProductIds([id]);
    const soldQuantity = soldQuantityMap.get(id) || 0;
    const soldBySizeMap = await getSoldQuantityByProductAndSize([id]);
    const soldBySize = soldBySizeMap.get(id) || new Map<string, number>();
    const inventory = getInventorySnapshot(product, soldQuantity);

    const sizeStockData = buildSizeStockSnapshot({
      sizeStock: product.sizeStock,
      sizes: getDeclaredSizes(product.sizes),
      soldBySize,
    });

    const colorImagesData = product.colorImages instanceof Map
      ? Object.fromEntries(product.colorImages)
      : (product.colorImages && typeof product.colorImages === "object" ? product.colorImages : null);

    const companionSettingsData = product.companionSettings instanceof Map
      ? Object.fromEntries(product.companionSettings)
      : (product.companionSettings && typeof product.companionSettings === "object" ? product.companionSettings : null);

    return NextResponse.json({
      product: {
        ...product,
        stock: inventory.availableStock,
        availableStock: inventory.availableStock,
        soldQuantity: inventory.soldQuantity,
        fullStock: inventory.fullStock,
        sizeStock: sizeStockData,
        colorImages: colorImagesData,
        companionSettings: companionSettingsData,
        visibilityStatus: product.isActive === false ? "inactive" : "active",
        availabilityStatus: getAvailabilityStatus({
          productType: product.productType,
          stock: inventory.availableStock,
          sizeStock: product.sizeStock,
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
    const soldQuantityMap = await getSoldQuantityByProductIds([id]);
    const soldQuantity = soldQuantityMap.get(id) || 0;
    const soldBySizeMap = await getSoldQuantityByProductAndSize([id]);
    const soldBySize = soldBySizeMap.get(id) || new Map<string, number>();

    const contentType = req.headers.get("content-type") || "";
    if (session.role === "admin" && contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Admins cannot edit products." }, { status: 403 });
    }
    if (contentType.includes("application/json")) {
      const body = await req.json();
      if (session.role === "admin") {
        const allowedAdminKeys = new Set(["approvalStatus", "isActive", "tag"]);
        const bodyKeys = Object.keys(body || {});
        const hasRestrictedKeys = bodyKeys.some((key) => !allowedAdminKeys.has(key));
        if (hasRestrictedKeys) {
          return NextResponse.json({ error: "Admins cannot edit products." }, { status: 403 });
        }
      }
      const update: Record<string, unknown> = {};
      const sizeStockMode = body.sizeStockMode === "restock" ? "restock" : "full";
      const declaredSizes = getDeclaredSizes(existingProduct.sizes, body.sizes);

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
        update.approvalStatus = body.approvalStatus;
      } else if (session.role === "store_owner") {
        const updatedKeys = Object.keys(body || {});
        const isVisibilityOnlyUpdate = updatedKeys.length > 0 && updatedKeys.every((key) => key === "isActive");
        if (!isVisibilityOnlyUpdate) {
          update.approvalStatus = "pending";
        }
      }

      if (body.sizeStock && typeof body.sizeStock === "object") {
        const sizeStockMap = new Map<string, { fullStock: number; stock: number; conditionScore: number | null }>();
        for (const size of declaredSizes) {
          sizeStockMap.set(size, { fullStock: 0, stock: 0, conditionScore: null });
        }

        for (const [size, entry] of getSizeStockEntries(existingProduct.sizeStock)) {
          sizeStockMap.set(size, {
            fullStock: Math.max(entry.fullStock ?? 0, 0),
            stock: Math.max(entry.stock ?? 0, 0),
            conditionScore: typeof (entry as { conditionScore?: number | null }).conditionScore === "number"
              ? Math.max(0, Math.min(10, Number((entry as { conditionScore?: number | null }).conditionScore) || 0))
              : null,
          });
        }

        for (const [size, qty] of Object.entries(
          body.sizeStock as Record<string, number | { fullStock?: number; stock?: number; conditionScore?: number }>
        )) {
          const nextValue =
            typeof qty === "object" && qty !== null
              ? Math.max(0, Number(qty.fullStock ?? qty.stock ?? 0) || 0)
              : Math.max(0, Number(qty) || 0);
          const currentEntry = sizeStockMap.get(size) || { fullStock: 0, stock: 0, conditionScore: null };
          const currentFullStock = Math.max(currentEntry.fullStock ?? currentEntry.stock ?? 0, 0);
          const fullStockForSize = sizeStockMode === "restock" ? currentFullStock + nextValue : nextValue;
          const sizeSold = soldBySize.get(size) || 0;
          const availableForSize = Math.max(0, fullStockForSize - sizeSold);
          sizeStockMap.set(size, {
            fullStock: fullStockForSize,
            stock: availableForSize,
            conditionScore:
              typeof qty === "object" && qty !== null && qty.conditionScore !== undefined
                ? Math.max(0, Math.min(10, Number(qty.conditionScore) || 0))
                : currentEntry.conditionScore ?? null,
          });
        }

        const sizeFilter = declaredSizes.length > 0 ? new Set(declaredSizes) : null;
        const entries = sizeFilter
          ? Array.from(sizeStockMap.entries()).filter(([size]) => sizeFilter.has(size))
          : Array.from(sizeStockMap.entries());
        const nextSizeStockMap = new Map(entries);
        let totalStock = 0;
        let totalFullStock = 0;
        for (const entry of nextSizeStockMap.values()) {
          totalStock += Math.max(entry.stock ?? 0, 0);
          totalFullStock += Math.max(entry.fullStock ?? 0, 0);
        }
        update.sizeStock = nextSizeStockMap;
        update.stock = totalStock;
        update.fullStock = totalFullStock;
        if (totalStock > 0) update.isActive = true;
      } else {
        const submittedFullStock =
          typeof body.fullStock !== "undefined" ? body.fullStock : body.stock;
        if (typeof submittedFullStock !== "undefined") {
          const rawStock = String(submittedFullStock).trim();
          if (rawStock.length === 0) {
            return NextResponse.json({ error: "Please enter a full stock value." }, { status: 400 });
          }
          const nextFullStock = Number(rawStock);
          if (!Number.isNaN(nextFullStock)) {
            const normalizedFullStock = Math.max(0, nextFullStock);
            update.fullStock = normalizedFullStock;
            update.stock = Math.max(0, normalizedFullStock - soldQuantity);
            if (normalizedFullStock - soldQuantity > 0) {
              update.isActive = true;
            }
          }
        }
      }
      update.updatedBy = auditActor;

      const product = await Product.findByIdAndUpdate(id, update, { new: true }).lean();
      if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const inventory = getInventorySnapshot(product, soldQuantity);
      const sizeStockData = buildSizeStockSnapshot({
        sizeStock: product.sizeStock,
        sizes: getDeclaredSizes(product.sizes),
        soldBySize,
      });

      return NextResponse.json({
        product: {
          ...product,
          stock: inventory.availableStock,
          availableStock: inventory.availableStock,
          soldQuantity: inventory.soldQuantity,
          fullStock: inventory.fullStock,
          sizeStock: sizeStockData,
          visibilityStatus: product.isActive === false ? "inactive" : "active",
          availabilityStatus: getAvailabilityStatus({
            productType: product.productType,
            stock: inventory.availableStock,
            sizeStock: product.sizeStock,
          }),
          approvalStatus: product.approvalStatus || "approved",
        },
      });
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

    const sizes = productType === "perfume" ? [] : parseStringArray(formData.get("sizes"));
    const variants = productType === "perfume" ? [] : parseProductVariants(formData.get("variants"));
    const rawSizeStock = String(formData.get("sizeStock") || "").trim();
    let sizeStockMap: Map<string, { fullStock: number; stock: number; conditionScore: number | null }> | null = null;
    let computedStock: number;
    let computedFullStock: number;

    if (productType !== "perfume" && rawSizeStock && rawSizeStock !== "{}") {
      try {
        const parsed = JSON.parse(rawSizeStock) as Record<string, number | { fullStock?: number; stock?: number; conditionScore?: number }>;
        sizeStockMap = new Map();
        computedStock = 0;
        computedFullStock = 0;
        for (const [size, qty] of Object.entries(parsed)) {
          const fullStockForSize =
            typeof qty === "object" && qty !== null
              ? Math.max(0, Number(qty.fullStock ?? qty.stock ?? 0) || 0)
              : Math.max(0, Number(qty) || 0);
          const sizeSold = soldBySize.get(size) || 0;
          const availableForSize = Math.max(0, fullStockForSize - sizeSold);
          const conditionScore =
            typeof qty === "object" && qty !== null && qty.conditionScore !== undefined
              ? Math.max(0, Math.min(10, Number(qty.conditionScore) || 0))
              : null;
          sizeStockMap.set(size, { fullStock: fullStockForSize, stock: availableForSize, conditionScore });
          computedStock += availableForSize;
          computedFullStock += fullStockForSize;
        }
      } catch {
        sizeStockMap = null;
        computedStock = Math.max(0, nextFullStock - soldQuantity);
        computedFullStock = nextFullStock;
      }
    } else {
      computedStock = Math.max(0, nextFullStock - soldQuantity);
      computedFullStock = nextFullStock;
    }

    const rawColorImages = String(formData.get("colorImages") || "").trim();
    let colorImagesMap: Map<string, number[]> | null = null;
    if (productType !== "perfume" && rawColorImages && rawColorImages !== "{}") {
      try {
        const parsed = JSON.parse(rawColorImages) as Record<string, number[]>;
        colorImagesMap = new Map(Object.entries(parsed));
      } catch { colorImagesMap = null; }
    }

    const conditionScore = (() => {
      if (explicitConditionScore !== null) return explicitConditionScore;
      if (!sizeStockMap) return null;
      const scores = Array.from(sizeStockMap.values())
        .map((e) => e.conditionScore)
        .filter((s): s is number => s !== null);
      if (scores.length === 0) return null;
      return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
    })();

    const body = {
      name: String(formData.get("name") || ""),
      price: Number(formData.get("price") || 0),
      isActive: formData.has("isActive")
        ? String(formData.get("isActive") || "true") === "true"
        : existingProduct.isActive !== false,
      categories: parseStringArray(formData.get("categories")),
      description: String(formData.get("description") || ""),
      brand: String(formData.get("brand") || "LOOKSMAX"),
      reference: normalizeReference(formData.get("reference")),
      tag: String(formData.get("tag") || ""),
      newTagDurationDays: Math.max(1, Math.floor(Number(formData.get("newTagDurationDays") || 3)) || 3),
      productType,
      fashionSubtype,
      conditionStatus:
        conditionScore === null ? null : getConditionStatusFromScore(conditionScore),
      conditionScore,
      fullStock: computedFullStock,
      stock: computedStock,
      sizeStock: sizeStockMap,
      colorImages: colorImagesMap,
      originPictures: normalizeOriginPictures(productType, fashionSubtype, newOriginPictures),
      sizes,
      colors: productType === "perfume" ? [] : parseStringArray(formData.get("colors")),
      variants,
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

    if (computedStock > 0) {
      body.isActive = true;
    }

    const duplicateResponse = await ensureUniqueProductReference({
      ownerId: existingProduct.createdBy?.id || session.userId,
      reference: body.reference || "",
      excludeProductId: id,
    });
    if (duplicateResponse) return duplicateResponse;

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
    const nextOriginPictures: Record<"front" | "back" | "left" | "right", string> = {
      front: body.originPictures?.front || "",
      back: body.originPictures?.back || "",
      left: body.originPictures?.left || "",
      right: body.originPictures?.right || "",
    };
    await Promise.all(
      (["front", "back", "left", "right"] as const).map(async (key) => {
        const previous = previousOriginPictures[key];
        const next = nextOriginPictures[key];
        if (previous && previous !== next) {
          await deleteProductImage(previous);
        }
      })
    );

    const inventory = getInventorySnapshot(product, soldQuantity);

    let sizeStockData: Record<string, { fullStock: number; stock: number; soldQuantity: number; conditionScore: number | null }> | null = null;
    if (product.sizeStock) {
      sizeStockData = {};
      for (const [size, entry] of getSizeStockEntries(product.sizeStock)) {
        sizeStockData[size] = {
          fullStock: entry.fullStock ?? 0,
          stock: entry.stock ?? 0,
          soldQuantity: soldBySize.get(size) || 0,
          conditionScore: typeof entry.conditionScore === "number"
            ? Math.max(0, Math.min(10, Number(entry.conditionScore) || 0))
            : null,
        };
      }
    }

    const response = NextResponse.json({
      product: {
        ...product,
        stock: inventory.availableStock,
        availableStock: inventory.availableStock,
        soldQuantity: inventory.soldQuantity,
        fullStock: inventory.fullStock,
        sizeStock: sizeStockData,
        visibilityStatus: product.isActive === false ? "inactive" : "active",
        availabilityStatus: getAvailabilityStatus({
          productType: product.productType,
          stock: inventory.availableStock,
          sizeStock: product.sizeStock,
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
    if (session.role === "admin") {
      return NextResponse.json({ error: "Admins cannot delete products." }, { status: 403 });
    }
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
