import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Order from "@/admin/models/Order";
import Product from "@/admin/models/Product";
import { getSession } from "@/admin/lib/auth";

const VALID_ORDER_STATUSES = ["processing", "confirmed", "canceled", "shipping", "delivered", "returned"] as const;
const BLOCKING_ORDER_STATUSES = ["processing", "confirmed", "shipping"] as const;
const FINAL_ORDER_STATUSES = ["delivered", "canceled", "returned"] as const;

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  processing: ["confirmed", "canceled"],
  confirmed: ["shipping"],
  shipping: ["delivered", "returned"],
  delivered: [],
  canceled: [],
  returned: [],
};

function serializeOrder(order: any) {
  return {
    ...order,
    _id: order._id.toString(),
    items: order.items.map((item: any) => ({
      ...item,
      productId: item.product.toString(),
    })),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { id } = await params;
    const order = await Order.findById(id).populate("user", "name email").lean();
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ order: serializeOrder(order) });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { id } = await params;
    const { orderStatus } = await req.json();
    if (orderStatus && !VALID_ORDER_STATUSES.includes(orderStatus)) {
      return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
    }

    const existingOrder = await Order.findById(id).lean();
    if (!existingOrder) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (FINAL_ORDER_STATUSES.includes(existingOrder.orderStatus as (typeof FINAL_ORDER_STATUSES)[number])) {
      return NextResponse.json({ error: "This order can no longer be updated." }, { status: 409 });
    }

    if (orderStatus && !ALLOWED_TRANSITIONS[existingOrder.orderStatus]?.includes(orderStatus)) {
      return NextResponse.json(
        { error: `You cannot move an order from ${existingOrder.orderStatus} to ${orderStatus}.` },
        { status: 409 }
      );
    }

    if (orderStatus === "confirmed" && existingOrder.orderStatus !== "confirmed") {
      const productIds = existingOrder.items.map((item) => item.product);
      const conflictingOrder = await Order.findOne({
        _id: { $ne: id },
        orderStatus: { $in: BLOCKING_ORDER_STATUSES },
        "items.product": { $in: productIds },
      }).lean();

      if (conflictingOrder) {
        const products = await Product.find({ _id: { $in: productIds } }).select("name").lean();
        const productNames = products.map((product) => product.name).join(", ");
        return NextResponse.json(
          { error: `These unique products are already confirmed in another order: ${productNames}` },
          { status: 409 }
        );
      }
    }

    const update: Record<string, string> = {};
    if (orderStatus) update.orderStatus = orderStatus;

    const order = await Order.findByIdAndUpdate(id, update, { new: true }).populate("user", "name email").lean();
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ order: serializeOrder(order) });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
