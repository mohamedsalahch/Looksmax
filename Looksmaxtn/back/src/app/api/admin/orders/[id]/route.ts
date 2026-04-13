import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Order from "@/admin/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import User from "@/store/models/User";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { sendOrderStatusEmail } from "@/store/lib/mailer";

const VALID_ORDER_STATUSES = ["processing", "confirmed", "canceled", "shipping", "delivered", "returned"] as const;
const FINAL_ORDER_STATUSES = ["delivered", "canceled", "returned"] as const;

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  processing: ["confirmed", "canceled"],
  confirmed: ["shipping"],
  shipping: ["delivered", "returned"],
  delivered: [],
  canceled: [],
  returned: [],
};

type LeanOrderItem = {
  product: { toString(): string } | string;
  quantity?: number;
  [key: string]: unknown;
};

type LeanOrder = {
  _id: { toString(): string };
  items: LeanOrderItem[];
  [key: string]: unknown;
};

function serializeOrder(order: LeanOrder) {
  return {
    ...order,
    _id: order._id.toString(),
    items: order.items.map((item) => ({
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
    const auditActor = await getAuditActorFromSession(session);
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

    if (["canceled", "returned"].includes(orderStatus || "") && existingOrder.orderStatus !== orderStatus) {
      const productIds = existingOrder.items.map((item: LeanOrderItem) => item.product);
      const products = await Product.find({ _id: { $in: productIds } })
        .select("_id stock productType")
        .lean();
      const productMap = new Map(products.map((product) => [product._id.toString(), product]));

      for (const item of existingOrder.items as LeanOrderItem[]) {
        const product = productMap.get(item.product.toString());
        if (!product) {
          return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        const quantityToRestore = item.quantity || 0;
        if (quantityToRestore > 0) {
          await Product.updateOne(
            { _id: item.product },
            { $inc: { stock: quantityToRestore } }
          );
        }
      }

      const orderUserId = typeof existingOrder.user === "object" && existingOrder.user !== null
        ? String(existingOrder.user.toString?.() || existingOrder.user)
        : String(existingOrder.user);

      if (orderUserId) {
        await ProductReservation.deleteMany({
          product: { $in: productIds },
          reservationKey: `user:${orderUserId}`,
        });
      }
    }

    const update: Record<string, unknown> = {};
    if (orderStatus) update.orderStatus = orderStatus;
    update.updatedBy = auditActor;

    const order = await Order.findByIdAndUpdate(
      id,
      update,
      { returnDocument: "after" }
    )
      .populate("user", "name email")
      .lean();
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (orderStatus) {
      try {
        const customer = await User.findById(existingOrder.user)
          .select("name email")
          .lean();
        if (!customer?.email) {
          return NextResponse.json({ order: serializeOrder(order) });
        }
        const frontendBaseUrl = (process.env.FRONTEND_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
        await sendOrderStatusEmail({
          to: customer.email,
          name: customer.name || order.shippingAddress?.fullName || "Customer",
          orderNumber: String(order._id).slice(-8).toUpperCase(),
          orderStatus: orderStatus as "processing" | "confirmed" | "shipping" | "delivered" | "canceled" | "returned",
          orderUrl: `${frontendBaseUrl}/account/orders/${order._id}`,
        });
      } catch (emailError) {
        console.error("Order status email error:", emailError);
      }
    }

    return NextResponse.json({ order: serializeOrder(order) });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const existingOrder = await Order.findById(id).lean();
    if (!existingOrder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (["delivered", "returned"].includes(existingOrder.orderStatus)) {
      return NextResponse.json(
        { error: "Delivered and returned orders cannot be deleted." },
        { status: 409 }
      );
    }

    if (existingOrder.orderStatus !== "canceled") {
      const productIds = existingOrder.items.map((item: LeanOrderItem) => item.product);
      const products = await Product.find({ _id: { $in: productIds } })
        .select("_id stock productType")
        .lean();
      const productMap = new Map(products.map((product) => [product._id.toString(), product]));

      for (const item of existingOrder.items as LeanOrderItem[]) {
        const product = productMap.get(item.product.toString());
        if (!product) {
          continue;
        }

        const quantityToRestore = item.quantity || 0;
        if (quantityToRestore > 0) {
          await Product.updateOne(
            { _id: item.product },
            { $inc: { stock: quantityToRestore } }
          );
        }
      }

      const orderUserId =
        typeof existingOrder.user === "object" && existingOrder.user !== null
          ? String(existingOrder.user.toString?.() || existingOrder.user)
          : String(existingOrder.user);

      if (orderUserId) {
        await ProductReservation.deleteMany({
          product: { $in: productIds },
          reservationKey: `user:${orderUserId}`,
        });
      }
    }

    const productIds = existingOrder.items.map((item: LeanOrderItem) => item.product);
    if (productIds.length > 0) {
      await ProductReservation.deleteMany({
        product: { $in: productIds },
      });
    }

    await Order.deleteOne({ _id: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
