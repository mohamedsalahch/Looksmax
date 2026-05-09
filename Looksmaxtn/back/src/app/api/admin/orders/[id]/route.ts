import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Order from "@/admin/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import User from "@/store/models/User";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
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
  user?: { name?: string; email?: string } | string | null;
  guestEmail?: string;
  shippingAddress?: { fullName?: string } | null;
  [key: string]: unknown;
};

function getOrderProductIds(items: LeanOrderItem[] = []) {
  return items.map((item) => item.product.toString()).filter(Boolean);
}

function getOrderUserId(user: unknown) {
  if (!user) return "";
  return typeof user === "object" && user !== null
    ? String((user as { toString?: () => string }).toString?.() || user)
    : String(user);
}

function serializeOrder(order: LeanOrder) {
  const user =
    typeof order.user === "object" && order.user !== null
      ? order.user
      : null;
  const customerName = user?.name || order.shippingAddress?.fullName || "Guest customer";
  const customerEmail = user?.email || order.guestEmail || "";

  return {
    ...order,
    _id: order._id.toString(),
    user: {
      name: customerName,
      email: customerEmail,
      isGuest: !user,
    },
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
  const shippingAddress =
    typeof order.shippingAddress === "object" && order.shippingAddress !== null
      ? (order.shippingAddress as { fullName?: string })
      : null;
  const items = Array.isArray(order.items) ? order.items : [];

  return {
    _id: id,
    orderStatus: String(order.orderStatus || ""),
    createdAt:
      order.createdAt instanceof Date
        ? order.createdAt.toISOString()
        : String(order.createdAt || new Date().toISOString()),
    user: {
      name: user?.name || shippingAddress?.fullName || "Guest customer",
      email: user?.email || String(order.guestEmail || ""),
      isGuest: !user,
    },
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

async function storeOwnerCanAccessOrder(session: { userId: string; role: string }, order: { items?: LeanOrderItem[] }) {
  if (session.role === "admin") return true;
  if (session.role !== "store_owner") return false;

  const orderProductIds = getOrderProductIds(order.items || []);
  if (orderProductIds.length === 0) return false;

  const ownedProductCount = await Product.countDocuments({
    _id: { $in: orderProductIds },
    "createdBy.id": session.userId,
  });
  return ownedProductCount > 0;
}

async function filterStoreOwnerOrderItems(session: { userId: string; role: string }, order: LeanOrder) {
  if (session.role === "admin") return order;

  const orderProductIds = getOrderProductIds(order.items);
  const ownedProductIds = await Product.find({
    _id: { $in: orderProductIds },
    "createdBy.id": session.userId,
  }).distinct("_id");
  const ownedProductIdSet = new Set(ownedProductIds.map((productId) => productId.toString()));

  return {
    ...order,
    items: order.items.filter((item) => ownedProductIdSet.has(item.product.toString())),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "orders")) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { id } = await params;
    const order = await Order.findById(id).populate("user", "name email").lean();
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const leanOrder = order as unknown as LeanOrder;
    if (!(await storeOwnerCanAccessOrder(session, leanOrder))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ order: serializeOrder(await filterStoreOwnerOrderItems(session, leanOrder)) });
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
    const existingLeanOrder = existingOrder as unknown as LeanOrder;

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
      const productIds = getOrderProductIds(existingLeanOrder.items);
      const products = await Product.find({ _id: { $in: productIds } })
        .select("_id stock productType")
        .lean();
      const productMap = new Map(products.map((product) => [product._id.toString(), product]));

      for (const item of existingLeanOrder.items) {
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
            { _id: item.product.toString() },
            update
          );
        }
      }

      const orderUserId = getOrderUserId(existingOrder.user);

      if (orderUserId) {
        await ProductReservation.deleteMany({
          product: { $in: productIds },
          reservationKey: `user:${orderUserId}`,
        });
      }
    }

    if (orderStatus === "delivered" && existingOrder.orderStatus !== "delivered") {
      const productIds = getOrderProductIds(existingLeanOrder.items);
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
    const existingLeanOrder = existingOrder as unknown as LeanOrder;

    if (!["canceled", "returned", "delivered"].includes(existingOrder.orderStatus)) {
      const productIds = getOrderProductIds(existingLeanOrder.items);
      const products = await Product.find({ _id: { $in: productIds } })
        .select("_id stock productType")
        .lean();
      const productMap = new Map(products.map((product) => [product._id.toString(), product]));

      for (const item of existingLeanOrder.items) {
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
            { _id: item.product.toString() },
            update
          );
        }
      }

      const orderUserId = getOrderUserId(existingOrder.user);

      if (orderUserId) {
        await ProductReservation.deleteMany({
          product: { $in: productIds },
          reservationKey: `user:${orderUserId}`,
        });
      }
    }

    const productIds = getOrderProductIds(existingLeanOrder.items);
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
