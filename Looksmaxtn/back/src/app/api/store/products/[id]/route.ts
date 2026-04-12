import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;
    const now = new Date();
    const [product, activeCartPresences] = await Promise.all([
      Product.findById(id).lean(),
      ProductReservation.find({ product: id, reservedUntil: { $gt: now } })
        .select("product reservedUntil")
        .lean(),
    ]);
    if (!product || product.isActive === false) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const cartCount = activeCartPresences.length;

    return NextResponse.json({
      product: {
        ...product,
        stock: Math.max(product.stock ?? 0, 0),
        cartCount,
        reservationExpiresAt: null,
      },
    });
  } catch (error: unknown) {
    console.error("Get product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const body = await req.json();
    const product = await Product.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (error: unknown) {
    console.error("Update product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Delete product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
