import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import StoreAccount from "@/store-owner/models/StoreAccount";
import { getStoreOwnerSession } from "@/store-owner/lib/auth";
import { saveProductImages } from "@/admin/lib/productUploads";

function parseStringArray(value: FormDataEntryValue | null) {
  try {
    return JSON.parse(String(value || "[]")) as string[];
  } catch {
    return [];
  }
}

function normalizeProductType(value: string) {
  return value === "perfume" ? "perfume" : "fashion";
}

function getAvailabilityStatus(productType?: string, stock = 0) {
  if (stock <= 0) return "out-of-stock";
  if (productType === "perfume" && stock <= 3) return "low-stock";
  return productType === "perfume" ? "in-stock" : "available";
}

function buildProductPayload(formData: FormData, store: { id: string; name: string }, imagePaths: string[]) {
  const productType = normalizeProductType(String(formData.get("productType") || "fashion"));
  const stock = Math.max(0, Number(formData.get("stock") || 0));
  const isActive = String(formData.get("isActive") || "true") === "true";

  return {
    store: store.name,
    storeId: store.id,
    name: String(formData.get("name") || ""),
    price: Number(formData.get("price") || 0),
    categories: parseStringArray(formData.get("categories")),
    description: String(formData.get("description") || ""),
    sizes: productType === "perfume" ? [] : parseStringArray(formData.get("sizes")),
    colors: productType === "perfume" ? [] : parseStringArray(formData.get("colors")),
    stock,
    fullStock: stock,
    images: imagePaths.map((url, index) => ({ url, isMain: index === 0 })),
    tag: String(formData.get("tag") || ""),
    brand: String(formData.get("brand") || store.name),
    reference: String(formData.get("reference") || ""),
    productType,
    fashionSubtype:
      productType === "fashion" ? String(formData.get("fashionSubtype") || "clothes") : null,
    isActive,
  };
}

export async function GET() {
  try {
    const session = await getStoreOwnerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const store = await StoreAccount.findById(session.storeId).lean();
    if (!store) return NextResponse.json({ error: "Store not found." }, { status: 404 });

    const products = await Product.find({ storeId: session.storeId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({
      products: products.map((product) => ({
        ...product,
        store: product.store || store.storeName,
        storeId: product.storeId || String(store._id),
        availabilityStatus: getAvailabilityStatus(product.productType, Math.max(product.stock ?? 0, 0)),
        visibilityStatus: product.isActive === false ? "inactive" : "active",
      })),
    });
  } catch (error) {
    console.error("Store owner products list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getStoreOwnerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const store = await StoreAccount.findById(session.storeId).lean();
    if (!store) return NextResponse.json({ error: "Store not found." }, { status: 404 });

    const formData = await req.formData();
    const imageFiles = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0);
    if (imageFiles.length === 0) {
      return NextResponse.json({ error: "Please upload at least one product image." }, { status: 400 });
    }

    const imagePaths = await saveProductImages(imageFiles);
    const product = await Product.create(buildProductPayload(formData, { id: String(store._id), name: store.storeName }, imagePaths));

    return NextResponse.json({
      product: {
        ...product.toObject(),
        store: store.storeName,
        storeId: String(store._id),
        availabilityStatus: getAvailabilityStatus(product.productType, Math.max(product.stock ?? 0, 0)),
        visibilityStatus: product.isActive === false ? "inactive" : "active",
      },
    });
  } catch (error) {
    console.error("Store owner products create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
