import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Order from "@/admin/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import User from "@/store/models/User";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";
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

function getAdminOrderEventPayload(order: Record<string, unknown>) {
  const id = String(order._id || "");
  const user =
    typeof order.user === "object" && order.user !== null
      ? (order.user as { name?: string; email?: string })
      : null;
  const items = Array.isArray(order.items) ? order.items : [];

  return {
    _id: id,
    orderStatus: String(order.orderStatus || ""),
    createdAt:
      order.createdAt instanceof Date
        ? order.createdAt.toISOString()
        : String(order.createdAt || new Date().toISOString()),
    user,
    totalPrice: Number(order.totalPrice || 0),
    isArchived: Boolean(order.isArchived),
    items: items.map((item) => {
      const itemRecord = item as Record<string, unknown>;
      return {
        product: String(itemRecord.productId || itemRecord.product || ""),
        name: String(itemRecord.name || ""),
        quantity: Number(itemRecord.quantity || 0),
      };
    }),
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
    return NextResponse.json({ order: serializeOrder(order as unknown as LeanOrder) });
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
      const productIds = existingOrder.items.map((item) => String(item.product));
      const products = await Product.find({ _id: { $in: productIds } })
        .select("_id stock productType")
        .lean();
      const productMap = new Map(products.map((product) => [product._id.toString(), product]));

      for (const item of existingOrder.items as unknown as LeanOrderItem[]) {
        const product = productMap.get(item.product.toString());
        if (!product) {
          return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        const quantityToRestore = item.quantity || 0;
        if (quantityToRestore > 0) {
          const itemSize = (item as { size?: string }).size || "";
          const sizeStockKey = itemSize ? `sizeStock.${itemSize}.stock` : null;
          const update: Record<string, unknown> = { $inc: { stock: quantityToRestore } };
          if (sizeStockKey) {
            (update.$inc as Record<string, number>)[sizeStockKey] = quantityToRestore;
          }
          await Product.updateOne(
            { _id: String(item.product) },
            update
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

    if (orderStatus === "delivered" && existingOrder.orderStatus !== "delivered") {
      const productIds = existingOrder.items.map((item) => String(item.product));
      if (productIds.length > 0) {
        await Product.updateMany(
          { _id: { $in: productIds } },
          { $set: { isActive: false } }
        );
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

    broadcastAdminEvent({ type: "order:upsert", order: getAdminOrderEventPayload(order as unknown as Record<string, unknown>) });

    if (orderStatus) {
      try {
        const frontendBaseUrl = (process.env.FRONTEND_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
        const orderNumber = String(order._id).slice(-8).toUpperCase();
        const statusCast = orderStatus as "processing" | "confirmed" | "shipping" | "delivered" | "canceled" | "returned";

        if (existingOrder.user) {
          const customer = await User.findById(existingOrder.user)
            .select("name email")
            .lean();
          if (customer?.email) {
            await sendOrderStatusEmail({
              to: customer.email,
              name: customer.name || order.shippingAddress?.fullName || "Customer",
              orderNumber,
              orderStatus: statusCast,
              orderUrl: `${frontendBaseUrl}/account/orders/${order._id}`,
            });
          }
        } else if (existingOrder.guestEmail && existingOrder.guestAccessToken) {
          await sendOrderStatusEmail({
            to: existingOrder.guestEmail,
            name: order.shippingAddress?.fullName || "Customer",
            orderNumber,
            orderStatus: statusCast,
            orderUrl: `${frontendBaseUrl}/orders/track/${order._id}?token=${existingOrder.guestAccessToken}`,
          });
        }
      } catch (emailError) {
        console.error("Order status email error:", emailError);
      }
    }

    return NextResponse.json({ order: serializeOrder(order as unknown as LeanOrder) });
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
      const productIds = existingOrder.items.map((item) => String(item.product));
      const products = await Product.find({ _id: { $in: productIds } })
        .select("_id stock productType")
        .lean();
      const productMap = new Map(products.map((product) => [product._id.toString(), product]));

      for (const item of existingOrder.items as unknown as LeanOrderItem[]) {
        const product = productMap.get(item.product.toString());
        if (!product) {
          continue;
        }

        const quantityToRestore = item.quantity || 0;
        if (quantityToRestore > 0) {
          const itemSize = (item as { size?: string }).size || "";
          const sizeStockKey = itemSize ? `sizeStock.${itemSize}.stock` : null;
          const update: Record<string, unknown> = { $inc: { stock: quantityToRestore } };
          if (sizeStockKey) {
            (update.$inc as Record<string, number>)[sizeStockKey] = quantityToRestore;
          }
          await Product.updateOne(
            { _id: String(item.product) },
            update
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

    const productIds = existingOrder.items.map((item) => String(item.product));
    if (productIds.length > 0) {
      await ProductReservation.deleteMany({
        product: { $in: productIds },
      });
    }

    await Order.deleteOne({ _id: id });

    broadcastAdminEvent({ type: "order:delete", orderId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
