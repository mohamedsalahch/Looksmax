import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import { getSession } from "@/store/lib/auth";
import { getAuditActorFromSession } from "@/store/lib/auditRoute";
import Product from "@/store/models/Product";
import Store from "@/store/models/Store";

async function getOwnedStoreIds(userId: string) {
  const stores = await Store.find({ owner: userId }).select("_id").lean();
  return stores.map((store) => store._id);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const { id } = await params;
    const storeIds = await getOwnedStoreIds(session.userId);
    const product = await Product.findOne({ _id: id, store: { $in: storeIds } })
      .populate("store", "name slug logo category status isMainStore")
      .lean();
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Get owner product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const { id } = await params;
    const storeIds = await getOwnedStoreIds(session.userId);
    const body = await req.json();
    const allowedFields = [
      "name",
      "price",
      "isActive",
      "categories",
      "description",
      "sizes",
      "colors",
      "stock",
      "fullStock",
      "tag",
      "brand",
      "reference",
    ];
    const update: Record<string, unknown> = { updatedBy: await getAuditActorFromSession(session) };
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) update[field] = body[field];
    }

    const product = await Product.findOneAndUpdate(
      { _id: id, store: { $in: storeIds } },
      update,
      { new: true }
    ).lean();
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Update owner product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const { id } = await params;
    const storeIds = await getOwnedStoreIds(session.userId);
    const product = await Product.findOneAndDelete({ _id: id, store: { $in: storeIds } });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete owner product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
