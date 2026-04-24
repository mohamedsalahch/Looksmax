import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Order from "@/store/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import { getAuditActorFromSession } from "@/store/lib/auditRoute";

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;
    const order = await Order.findById(id).populate("user", "name email").lean();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Only allow access to own orders (or admin)
    if (session.role !== "admin" && order.user?._id?.toString() !== session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({ order });
  } catch (error: unknown) {
    console.error("Get order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const auditActor = await getAuditActorFromSession(session);
    const { orderStatus, archive } = await req.json();

    if (archive === true) {
      const order = await Order.findById(id).populate("user", "name email").lean();
      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      const orderUserId =
        typeof order.user === "object" && order.user !== null && "_id" in order.user
          ? String((order.user as { _id?: { toString(): string } })._id?.toString() || "")
          : String(order.user || "");

      if (session.role !== "admin" && orderUserId !== session.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      const archivedOrder = await Order.findByIdAndUpdate(
        id,
        { isArchived: true, archivedAt: new Date(), updatedBy: auditActor },
        { new: true }
      )
        .populate("user", "name email")
        .lean();

      return NextResponse.json({ order: archivedOrder });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (orderStatus && !VALID_ORDER_STATUSES.includes(orderStatus)) {
      return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (orderStatus) update.orderStatus = orderStatus;
    update.updatedBy = auditActor;

    const existingOrder = await Order.findById(id).lean();
    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

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
      for (const item of existingOrder.items) {
        const quantityToRestore = item.quantity || 0;
        if (quantityToRestore > 0) {
          const itemSize = item.size || "";
          const sizeStockKey = itemSize ? `sizeStock.${itemSize}.stock` : null;
          const update: Record<string, unknown> = { $inc: { stock: quantityToRestore } };
          if (sizeStockKey) {
            (update.$inc as Record<string, number>)[sizeStockKey] = quantityToRestore;
          }
          await Product.updateOne(
            { _id: item.product },
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
          product: { $in: existingOrder.items.map((item) => item.product) },
          reservationKey: `user:${orderUserId}`,
        });
      }
    }

    if (orderStatus === "delivered" && existingOrder.orderStatus !== "delivered") {
      const productIds = existingOrder.items.map((item) => item.product);
      if (productIds.length > 0) {
        await Product.updateMany(
          { _id: { $in: productIds } },
          { $set: { isActive: false } }
        );
      }
    }

    if (orderStatus === "confirmed" && existingOrder.orderStatus !== "confirmed") {
      const productVariantKeys = existingOrder.items.map((item) => `${item.product?.toString?.() || String(item.product || "")}:${item.size || ""}`);
      const conflictingOrders = await Order.find({
        _id: { $ne: id },
        orderStatus: { $in: BLOCKING_ORDER_STATUSES },
      }).lean();

      const conflictingProductNames = new Set<string>();
      for (const order of conflictingOrders) {
        for (const item of order.items || []) {
          const key = `${item.product?.toString?.() || String(item.product || "")}:${item.size || ""}`;
          if (productVariantKeys.includes(key)) {
            const product = await Product.findById(item.product).select("name").lean();
            if (product?.name) conflictingProductNames.add(`${product.name}${item.size ? ` (size ${item.size})` : ""}`);
          }
        }
      }

      if (conflictingProductNames.size > 0) {
        const productNames = Array.from(conflictingProductNames).join(", ");
        return NextResponse.json(
          { error: `These product sizes are already confirmed in another order: ${productNames}` },
          { status: 409 }
        );
      }
    }

    const order = await Order.findByIdAndUpdate(id, update, { new: true })
      .populate("user", "name email")
      .lean();

    return NextResponse.json({ order });
  } catch (error: unknown) {
    console.error("Update order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
