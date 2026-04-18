import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import { getSession } from "@/admin/lib/auth";
import { deleteProductImage, saveProductImages } from "@/admin/lib/productUploads";
import { getConditionStatusFromScore } from "@/admin/lib/productCondition";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";
import { getSoldQuantityByProductAndSize, getSoldQuantityByProductIds } from "@/lib/productInventory";

function getAvailabilityStatus(params: {
  productType?: string;
  stock: number;
}) {
  const { productType, stock } = params;

  if (stock <= 0) return "out-of-stock";
  if (productType === "perfume" && stock <= 3) return "low-stock";
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

function getInventorySnapshot(product: { stock?: number; fullStock?: number }, soldQuantity: number) {
  const availableStock = Math.max(product.stock ?? 0, 0);
  const fullStock =
    typeof product.fullStock === "number"
      ? Math.max(product.fullStock, 0)
      : Math.max(availableStock + soldQuantity, 0);

  return { availableStock, fullStock, soldQuantity };
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

function getSizeStockEntries(
  sizeStock: unknown
): Array<[string, { fullStock?: number; stock?: number }]> {
  if (sizeStock instanceof Map) {
    return Array.from(sizeStock.entries());
  }

  if (!sizeStock || typeof sizeStock !== "object") return [];

  return Object.entries(sizeStock as Record<string, { fullStock?: number; stock?: number }>);
}

function buildSizeStockSnapshot(params: {
  sizeStock?: unknown;
  sizes: string[];
  soldBySize: Map<string, number>;
}) {
  const { sizeStock, sizes, soldBySize } = params;
  if (!sizeStock && sizes.length === 0) return null;

  const snapshot: Record<string, { fullStock: number; stock: number; soldQuantity: number }> = {};
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
    };
  }

  return snapshot;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { id } = await params;
    const product = await Product.findById(id).lean();
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
        }),
      },
    });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await logRequestStart("admin.products.id.put", req);
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { id } = await params;
    const auditActor = await getAuditActorFromSession(session);
    const existingProduct = await Product.findById(id).lean();
    if (!existingProduct) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const soldQuantityMap = await getSoldQuantityByProductIds([id]);
    const soldQuantity = soldQuantityMap.get(id) || 0;
    const soldBySizeMap = await getSoldQuantityByProductAndSize([id]);
    const soldBySize = soldBySizeMap.get(id) || new Map<string, number>();

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const update: Record<string, unknown> = {};
      const sizeStockMode = body.sizeStockMode === "restock" ? "restock" : "full";
      const declaredSizes = getDeclaredSizes(existingProduct.sizes, body.sizes);

      if (typeof body.isActive === "boolean") {
        update.isActive = body.isActive;
      }

      if (body.sizeStock && typeof body.sizeStock === "object") {
        const sizeStockMap = new Map<string, { fullStock: number; stock: number }>();
        for (const size of declaredSizes) {
          sizeStockMap.set(size, { fullStock: 0, stock: 0 });
        }

        for (const [size, entry] of getSizeStockEntries(existingProduct.sizeStock)) {
          sizeStockMap.set(size, {
            fullStock: Math.max(entry.fullStock ?? 0, 0),
            stock: Math.max(entry.stock ?? 0, 0),
          });
        }

        for (const [size, qty] of Object.entries(body.sizeStock as Record<string, number>)) {
          const nextValue = Math.max(0, Number(qty) || 0);
          const currentEntry = sizeStockMap.get(size) || { fullStock: 0, stock: 0 };
          const currentFullStock = Math.max(currentEntry.fullStock ?? currentEntry.stock ?? 0, 0);
          const fullStockForSize = sizeStockMode === "restock" ? currentFullStock + nextValue : nextValue;
          const sizeSold = soldBySize.get(size) || 0;
          const availableForSize = Math.max(0, fullStockForSize - sizeSold);
          sizeStockMap.set(size, { fullStock: fullStockForSize, stock: availableForSize });
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
          }),
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
    const conditionScore =
      productType === "perfume" ? null : Number(formData.get("conditionScore") || 7);
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

    if (mergedImages.length === 0) {
      return NextResponse.json({ error: "Please keep or upload at least one product image." }, { status: 400 });
    }

    const selectedKey = mergedImages.some((image) => image.key === mainImageKey)
      ? mainImageKey
      : mergedImages[0].key;

    const images = mergedImages.map(({ key, url }) => ({
      url,
      isMain: key === selectedKey,
    }));

    const removedImages = (existingProduct.images || [])
      .map((image) => image.url)
      .filter((url) => !existingImages.some((image) => image.url === url));

    const sizes = productType === "perfume" ? [] : parseStringArray(formData.get("sizes"));
    const rawSizeStock = String(formData.get("sizeStock") || "").trim();
    let sizeStockMap: Map<string, { fullStock: number; stock: number }> | null = null;
    let computedStock: number;
    let computedFullStock: number;

    if (productType !== "perfume" && rawSizeStock && rawSizeStock !== "{}") {
      try {
        const parsed = JSON.parse(rawSizeStock) as Record<string, number>;
        sizeStockMap = new Map();
        computedStock = 0;
        computedFullStock = 0;
        for (const [size, qty] of Object.entries(parsed)) {
          const fullStockForSize = Math.max(0, Number(qty) || 0);
          const sizeSold = soldBySize.get(size) || 0;
          const availableForSize = Math.max(0, fullStockForSize - sizeSold);
          sizeStockMap.set(size, { fullStock: fullStockForSize, stock: availableForSize });
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

    const body = {
      name: String(formData.get("name") || ""),
      price: Number(formData.get("price") || 0),
      isActive: formData.has("isActive")
        ? String(formData.get("isActive") || "true") === "true"
        : existingProduct.isActive !== false,
      categories: parseStringArray(formData.get("categories")),
      description: String(formData.get("description") || ""),
      brand: String(formData.get("brand") || "LOOKSMAX"),
      tag: String(formData.get("tag") || ""),
      productType,
      fashionSubtype,
      conditionStatus:
        conditionScore === null ? null : getConditionStatusFromScore(conditionScore),
      conditionScore,
      fullStock: computedFullStock,
      stock: computedStock,
      sizeStock: sizeStockMap,
      originPictures: normalizeOriginPictures(productType, fashionSubtype, newOriginPictures),
      sizes,
      colors: productType === "perfume" ? [] : parseStringArray(formData.get("colors")),
      cloneSourceName: productType === "perfume" ? String(formData.get("cloneSourceName") || "") : "",
      cloneSourceImage:
        productType === "perfume"
          ? newCloneSourceImagePath || String(formData.get("cloneSourceImage") || "")
          : "",
      images,
      updatedBy: auditActor,
    };

    if (computedStock > 0) {
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

    let sizeStockData: Record<string, { fullStock: number; stock: number; soldQuantity: number }> | null = null;
    if (product.sizeStock && product.sizeStock instanceof Map && product.sizeStock.size > 0) {
      sizeStockData = {};
      for (const [size, entry] of product.sizeStock) {
        sizeStockData[size] = {
          fullStock: entry.fullStock,
          stock: entry.stock,
          soldQuantity: soldBySize.get(size) || 0,
        };
      }
    }

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
        }),
      },
    });
  } catch (error) { logRequestError("admin.products.id.put", req, error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { id } = await params;
    await Product.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
