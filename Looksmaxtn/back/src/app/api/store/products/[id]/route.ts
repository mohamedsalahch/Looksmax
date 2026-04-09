import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Order from "@/store/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";

const BLOCKING_ORDER_STATUSES = ["processing", "confirmed", "shipping"];
const ACTIVE_STOCK_ORDER_STATUSES = ["processing", "confirmed", "shipping", "delivered"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;
    const now = new Date();
    const [product, activeOrders, activeReservation] = await Promise.all([
      Product.findById(id).lean(),
      Order.find({
        orderStatus: { $in: ACTIVE_STOCK_ORDER_STATUSES },
        "items.product": id,
      })
        .select("orderStatus items.product items.quantity")
        .lean(),
      ProductReservation.findOne({ product: id, reservedUntil: { $gt: now } })
        .select("reservedUntil")
        .lean(),
    ]);
    if (!product || product.isActive === false) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const hasBlockingOrder = activeOrders.some((order) =>
      BLOCKING_ORDER_STATUSES.includes(order.orderStatus)
    );
    const hasHiddenOrder =
      product.productType !== "perfume" &&
      activeOrders.some((order) => order.orderStatus === "delivered");
    const perfumeQuantityInOrders = activeOrders.reduce((sum, order) => {
      const quantity = order.items
        .filter((item) => item.product?.toString() === id)
        .reduce((itemSum, item) => itemSum + (item.quantity || 0), 0);
      return sum + quantity;
    }, 0);

    if (hasHiddenOrder) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({
      product: {
        ...product,
        stock:
          product.productType === "perfume"
            ? Math.max((product.stock ?? 0) - perfumeQuantityInOrders, 0)
            : hasBlockingOrder || activeReservation
              ? 0
              : Math.min(product.stock ?? 1, 1),
        reservationExpiresAt:
          product.productType === "perfume"
            ? null
            : activeReservation?.reservedUntil?.toISOString() || null,
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
