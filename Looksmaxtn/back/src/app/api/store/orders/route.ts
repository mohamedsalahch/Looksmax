import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Order from "@/store/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";
import { getAuditActorFromSession } from "@/store/lib/auditRoute";
import { sendOrderStatusEmail } from "@/store/lib/mailer";
import mongoose from "mongoose";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    let orders;
    if (session.role === "admin") {
      orders = await Order.find()
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .lean();
    } else {
      orders = await Order.find({ user: session.userId, isArchived: { $ne: true } })
        .sort({ createdAt: -1 })
        .lean();
    }

    return NextResponse.json({ orders });
  } catch (error: unknown) {
    console.error("Get orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const stockAdjustments: Array<{ productId: string; quantity: number }> = [];

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Please login to place an order" }, { status: 401 });
    }

    await dbConnect();
    const auditActor = await getAuditActorFromSession(session);
    const { items, shippingAddress } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items in order" }, { status: 400 });
    }

    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.street || !shippingAddress.city || !shippingAddress.phone) {
      return NextResponse.json({ error: "Complete shipping address is required" }, { status: 400 });
    }

    let totalPrice = 0;
    const orderItems = [];
    const seenProductIds = new Set<string>();
    for (const item of items) {
      if (!mongoose.Types.ObjectId.isValid(item.productId)) {
        return NextResponse.json(
          { error: `Invalid product ID format for ${item.name}. Please clear your cart. ` },
          { status: 400 }
        );
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        return NextResponse.json(
          { error: `Product not found: ${item.name}` },
          { status: 400 }
        );
      }

      const productId = product._id.toString();
      if (seenProductIds.has(productId)) {
        return NextResponse.json(
          { error: `${product.name} can only appear once in an order.` },
          { status: 400 }
        );
      }

      const quantityToDeduct = item.quantity;
      if (quantityToDeduct < 1) {
        return NextResponse.json(
          { error: `${product.name} does not have enough stock available.` },
          { status: 400 }
        );
      }

      if ((product.stock ?? 0) < quantityToDeduct) {
        return NextResponse.json(
          { error: `${product.name} is already sold. Please remove it from your cart.` },
          { status: 409 }
        );
      }

      const updatedProduct = await Product.findOneAndUpdate(
        { _id: product._id, stock: { $gte: quantityToDeduct } },
        { $inc: { stock: -quantityToDeduct } },
        { returnDocument: "after" }
      ).lean();

      if (!updatedProduct) {
        return NextResponse.json(
          { error: `${product.name} is already sold. Please remove it from your cart.` },
          { status: 409 }
        );
      }

      stockAdjustments.push({ productId: productId, quantity: quantityToDeduct });
      seenProductIds.add(productId);

      const itemTotal = product.price * item.quantity;
      totalPrice += itemTotal;

      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        size: item.size || "",
        color: item.color || "",
        quantity: item.quantity,
      });
    }

    const order = await Order.create({
      user: session.userId,
      items: orderItems,
      isArchived: false,
      shippingAddress,
      paymentMethod: "cod",
      orderStatus: "processing",
      totalPrice,
      createdBy: auditActor,
      updatedBy: auditActor,
    });

    try {
      const customer = await User.findById(session.userId).select("name email").lean();
      if (customer?.email) {
        const frontendBaseUrl = (process.env.FRONTEND_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
        await sendOrderStatusEmail({
          to: customer.email,
          name: customer.name || shippingAddress.fullName || "Customer",
          orderNumber: order._id.toString().slice(-8).toUpperCase(),
          orderStatus: "processing",
          orderUrl: `${frontendBaseUrl}/account/orders/${order._id.toString()}`,
        });
      }
    } catch (emailError) {
      console.error("Order confirmation email error:", emailError);
    }

    try {
      const reservationKey = `user:${session.userId}`;
      await ProductReservation.deleteMany({
        product: { $in: stockAdjustments.map((adjustment) => adjustment.productId) },
        reservationKey,
      });
    } catch (reservationCleanupError) {
      console.error("Cleanup order reservations error:", reservationCleanupError);
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (error: unknown) {
    try {
      for (const adjustment of stockAdjustments) {
        await Product.updateOne(
          { _id: adjustment.productId },
          { $inc: { stock: adjustment.quantity } }
        );
      }
    } catch {
      // Ignore rollback failures and surface the original error.
    }
    console.error("Create order error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
