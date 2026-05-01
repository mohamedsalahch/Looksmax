import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
import { saveProductImages } from "@/admin/lib/productUploads";
import { getConditionStatusFromScore } from "@/admin/lib/productCondition";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";
import { getSoldQuantityByProductAndSize, getSoldQuantityByProductIds } from "@/lib/productInventory";

function getSizeStockEntries(
  sizeStock: unknown
): Array<[string, { fullStock?: number; stock?: number }]> {
  if (sizeStock instanceof Map) {
    return Array.from(sizeStock.entries());
  }

  if (!sizeStock || typeof sizeStock !== "object") return [];

  return Object.entries(sizeStock as Record<string, { fullStock?: number; stock?: number }>);
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

function getProductPayload(
  formData: FormData,
  imagePaths: string[],
  mainImageIndex: number,
  cloneSourceImagePath = "",
  originPictures?: Partial<Record<"front" | "back" | "left" | "right", string>>
) {
  const productType = normalizeProductType(String(formData.get("productType") || "fashion"));
  const fashionSubtype =
    productType === "fashion" ? String(formData.get("fashionSubtype") || "clothes") : null;
  const rawStockValue = String(formData.get("fullStock") ?? formData.get("stock") ?? "").trim();
  const rawStock = rawStockValue.length > 0 ? Number(rawStockValue) : NaN;
  const conditionScore =
    productType === "perfume" ? Number(formData.get("conditionScore") || 9) : null;
  const sizes = productType === "perfume" ? [] : parseStringArray(formData.get("sizes"));
  const colors = productType === "perfume" ? [] : parseStringArray(formData.get("colors"));

  const rawSizeStock = String(formData.get("sizeStock") || "").trim();
  let sizeStockMap: Map<string, { fullStock: number; stock: number; conditionScore: number | null }> | null = null;
  if (productType !== "perfume" && rawSizeStock && rawSizeStock !== "{}") {
    try {
      const parsed = JSON.parse(rawSizeStock) as Record<string, number | { fullStock?: number; stock?: number; conditionScore?: number }>;
      sizeStockMap = new Map(
        Object.entries(parsed).map(([size, qty]) => {
          const fullStock = typeof qty === "object" && qty !== null ? Number(qty.fullStock ?? qty.stock ?? 0) : Number(qty) || 0;
          const stock = typeof qty === "object" && qty !== null ? Number(qty.stock ?? qty.fullStock ?? 0) : Number(qty) || 0;
          const conditionScore = typeof qty === "object" && qty !== null && qty.conditionScore !== undefined
            ? Math.max(0, Math.min(10, Number(qty.conditionScore) || 0))
            : null;
          return [size, { fullStock: Math.max(0, fullStock), stock: Math.max(0, stock), conditionScore }];
        })
      );
    } catch {
      sizeStockMap = null;
    }
  }

  return {
    name: String(formData.get("name") || ""),
    price: Number(formData.get("price") || 0),
    isActive: String(formData.get("isActive") || "true") === "true",
    categories: parseStringArray(formData.get("categories")),
    description: String(formData.get("description") || ""),
    brand: String(formData.get("brand") || "LOOKSMAX"),
    reference: String(formData.get("reference") || ""),
    stock: Number.isNaN(rawStock) ? 0 : Math.max(0, rawStock),
    sizeStock: sizeStockMap,
    tag: String(formData.get("tag") || ""),
    newTagDurationDays: Math.max(1, Math.floor(Number(formData.get("newTagDurationDays") || 3)) || 3),
    productType,
    fashionSubtype,
    conditionStatus:
      conditionScore === null ? null : getConditionStatusFromScore(conditionScore),
    conditionScore,
    originPictures: normalizeOriginPictures(productType, fashionSubtype, originPictures),
    sizes,
    colors,
    cloneSourceName: productType === "perfume" ? String(formData.get("cloneSourceName") || "") : "",
    cloneSourceImage:
      productType === "perfume" ? cloneSourceImagePath || String(formData.get("cloneSourceImage") || "") : "",
    images: imagePaths.map((url, index) => ({
      url,
      isMain: index === Math.min(mainImageIndex, imagePaths.length - 1),
    })),
  };
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
    const soldBySizeMap = await getSoldQuantityByProductAndSize(productIds);

    return NextResponse.json({
      products: products.map((product) => {
        const productId = product._id.toString();
        const soldQuantity = soldQuantityMap.get(productId) || 0;
        const soldBySize = soldBySizeMap.get(productId) || new Map<string, number>();
        const inventory = getInventorySnapshot(product, soldQuantity);

        let sizeStockData: Record<string, { fullStock: number; stock: number; soldQuantity: number }> | null = null;
        if (product.sizeStock && product.sizeStock instanceof Map && product.sizeStock.size > 0) {
          sizeStockData = {};
          for (const [size, entry] of product.sizeStock) {
            const sizeSold = soldBySize.get(size) || 0;
            sizeStockData[size] = {
              fullStock: entry.fullStock,
              stock: entry.stock,
              soldQuantity: sizeSold,
            };
          }
        }

        return {
          ...product,
          stock: inventory.availableStock,
          availableStock: inventory.availableStock,
          soldQuantity: inventory.soldQuantity,
          fullStock: inventory.fullStock,
          sizeStock: sizeStockData,
          availabilityStatus: getAvailabilityStatus({
            productType: product.productType,
            stock: Math.max(product.stock ?? 0, 0),
            sizeStock: product.sizeStock,
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
    const body = getProductPayload(
      formData,
      imagePaths,
      mainImageIndex,
      cloneSourceImagePath,
      originPictures
    );
    if (session.role === "store_owner") {
      body.tag = "NEW";
      body.newTagDurationDays = 3;
    }
    const rawFullStock = String(formData.get("fullStock") ?? formData.get("stock") ?? "").trim();
    if (rawFullStock.length === 0) {
      return NextResponse.json({ error: "Please enter a full stock value." }, { status: 400 });
    }
    const fullStock = Math.max(0, Number(rawFullStock));

    let stock = fullStock;
    if (body.sizeStock && body.sizeStock instanceof Map && body.sizeStock.size > 0) {
      stock = 0;
      for (const entry of body.sizeStock.values()) {
        stock += entry.stock;
      }
    } else {
      body.sizeStock = null;
    }

    const product = await Product.create({
      ...body,
      stock,
      fullStock: body.sizeStock ? stock : fullStock,
      approvalStatus: session.role === "store_owner" ? "pending" : "approved",
      createdBy: auditActor,
      updatedBy: auditActor,
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) { logRequestError("admin.products.post", req, error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
