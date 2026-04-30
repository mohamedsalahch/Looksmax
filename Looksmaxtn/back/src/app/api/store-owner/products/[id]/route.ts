import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import StoreAccount from "@/store-owner/models/StoreAccount";
import { deleteProductImage, saveProductImages } from "@/admin/lib/productUploads";
import { getStoreOwnerSession } from "@/store-owner/lib/auth";

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

async function loadOwnedProduct(id: string, storeId: string) {
  const product = await Product.findOne({ _id: id, storeId }).lean();
  return product || null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getStoreOwnerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const store = await StoreAccount.findById(session.storeId).lean();
    if (!store) return NextResponse.json({ error: "Store not found." }, { status: 404 });

    const { id } = await params;
    const product = await loadOwnedProduct(id, session.storeId);
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      product: {
        ...product,
        store: product.store || store.storeName,
        storeId: product.storeId || String(store._id),
        availabilityStatus: getAvailabilityStatus(product.productType, Math.max(product.stock ?? 0, 0)),
        visibilityStatus: product.isActive === false ? "inactive" : "active",
      },
    });
  } catch (error) {
    console.error("Store owner product fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getStoreOwnerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const store = await StoreAccount.findById(session.storeId).lean();
    if (!store) return NextResponse.json({ error: "Store not found." }, { status: 404 });

    const { id } = await params;
    const existing = await loadOwnedProduct(id, session.storeId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const formData = await req.formData();
    const existingImages = JSON.parse(String(formData.get("existingImages") || "[]")) as { url: string }[];
    const imageOrder = JSON.parse(String(formData.get("imageOrder") || "[]")) as string[];
    const imageFiles = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0);
    const newImagePaths = await saveProductImages(imageFiles);

    const existingImageMap = new Map(existingImages.map((image) => [`existing:${image.url}`, image.url]));
    const newImageMap = new Map(newImagePaths.map((url, index) => [`new:${index}`, url]));
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

    const mainImageKey = String(formData.get("mainImageKey") || "");
    const selectedKey = mergedImages.some((image) => image.key === mainImageKey) ? mainImageKey : mergedImages[0].key;
    const removedImages = (existing.images || [])
      .map((image) => image.url)
      .filter((url) => !existingImages.some((image) => image.url === url));

    const productType = normalizeProductType(String(formData.get("productType") || existing.productType || "fashion"));
    const stock = Math.max(0, Number(formData.get("stock") || existing.stock || 0));
    const nextProduct = await Product.findByIdAndUpdate(
      id,
      {
        store: store.storeName,
        storeId: String(store._id),
        name: String(formData.get("name") || existing.name),
        price: Number(formData.get("price") || existing.price || 0),
        categories: parseStringArray(formData.get("categories")),
        description: String(formData.get("description") || existing.description || ""),
        sizes: productType === "perfume" ? [] : parseStringArray(formData.get("sizes")),
        colors: productType === "perfume" ? [] : parseStringArray(formData.get("colors")),
        stock,
        fullStock: stock,
        images: mergedImages.map(({ key, url }) => ({ url, isMain: key === selectedKey })),
        tag: String(formData.get("tag") || existing.tag || ""),
        brand: String(formData.get("brand") || existing.brand || store.storeName),
        reference: String(formData.get("reference") || existing.reference || ""),
        productType,
        fashionSubtype:
          productType === "fashion" ? String(formData.get("fashionSubtype") || "clothes") : null,
        isActive: String(formData.get("isActive") || "true") === "true",
      },
      { new: true }
    ).lean();

    if (!nextProduct) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await Promise.all(removedImages.map((imagePath) => deleteProductImage(imagePath)));

    return NextResponse.json({
      product: {
        ...nextProduct,
        store: nextProduct.store || store.storeName,
        storeId: nextProduct.storeId || String(store._id),
        availabilityStatus: getAvailabilityStatus(nextProduct.productType, Math.max(nextProduct.stock ?? 0, 0)),
        visibilityStatus: nextProduct.isActive === false ? "inactive" : "active",
      },
    });
  } catch (error) {
    console.error("Store owner product update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getStoreOwnerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const { id } = await params;
    const existing = await loadOwnedProduct(id, session.storeId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await Promise.all((existing.images || []).map((image) => deleteProductImage(image.url)));
    await Product.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Store owner product delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
