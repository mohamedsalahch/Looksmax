import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import { getSession } from "@/store/lib/auth";
import { getAuditActorFromSession } from "@/store/lib/auditRoute";
import Product from "@/store/models/Product";
import Store from "@/store/models/Store";
import { saveProductImages } from "@/admin/lib/productUploads";
import { getConditionStatusFromScore } from "@/admin/lib/productCondition";
import mongoose from "mongoose";

function parseStringArray(value: FormDataEntryValue | null) {
  return JSON.parse(String(value || "[]")) as string[];
}

async function getOwnedApprovedStore(userId: string, requestedStoreId?: string) {
  const filter: Record<string, unknown> = { owner: userId, status: "approved" };
  if (requestedStoreId && mongoose.Types.ObjectId.isValid(requestedStoreId)) {
    filter._id = requestedStoreId;
  }
  return Store.findOne(filter);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const store = await getOwnedApprovedStore(session.userId, searchParams.get("storeId") || undefined);
    if (!store) return NextResponse.json({ products: [] });

    const products = await Product.find({ store: store._id })
      .populate("store", "name slug logo category status isMainStore")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Get owner products error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const formData = await req.formData();
    const store = await getOwnedApprovedStore(session.userId, String(formData.get("storeId") || ""));
    if (!store) {
      return NextResponse.json({ error: "Approved store not found" }, { status: 403 });
    }

    const imageFiles = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0);
    if (imageFiles.length === 0) {
      return NextResponse.json({ error: "Please upload at least one product image." }, { status: 400 });
    }

    const imagePaths = await saveProductImages(imageFiles);
    const productType = String(formData.get("productType") || "fashion") === "perfume" ? "perfume" : "fashion";
    const conditionScore = productType === "perfume" ? null : Number(formData.get("conditionScore") || 7);
    const rawFullStock = String(formData.get("fullStock") ?? formData.get("stock") ?? "").trim();
    if (!rawFullStock) {
      return NextResponse.json({ error: "Please enter a full stock value." }, { status: 400 });
    }
    const fullStock = Math.max(0, Number(rawFullStock));

    const auditActor = await getAuditActorFromSession(session);
    const product = await Product.create({
      store: store._id,
      storeNameSnapshot: store.name,
      name: String(formData.get("name") || ""),
      price: Number(formData.get("price") || 0),
      isActive: true,
      categories: parseStringArray(formData.get("categories")),
      description: String(formData.get("description") || ""),
      brand: String(formData.get("brand") || store.name),
      reference: String(formData.get("reference") || ""),
      stock: fullStock,
      fullStock,
      sizeStock: null,
      tag: String(formData.get("tag") || ""),
      productType,
      fashionSubtype: productType === "fashion" ? String(formData.get("fashionSubtype") || "clothes") : null,
      conditionStatus: conditionScore === null ? null : getConditionStatusFromScore(conditionScore),
      conditionScore,
      sizes: productType === "perfume" ? [] : parseStringArray(formData.get("sizes")),
      colors: productType === "perfume" ? [] : parseStringArray(formData.get("colors")),
      images: imagePaths.map((url, index) => ({ url, isMain: index === 0 })),
      createdBy: auditActor,
      updatedBy: auditActor,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error("Create owner product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
