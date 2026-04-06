import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Order from "@/store/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import mongoose from "mongoose";

const BLOCKING_ORDER_STATUSES = ["processing", "confirmed", "shipping"];

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
      orders = await Order.find({ user: session.userId })
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
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Please login to place an order" }, { status: 401 });
    }

    await dbConnect();
    const { items, shippingAddress, reservationKey } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items in order" }, { status: 400 });
    }

    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.street || !shippingAddress.city || !shippingAddress.phone) {
      return NextResponse.json({ error: "Complete shipping address is required" }, { status: 400 });
    }

    let totalPrice = 0;
    const orderItems = [];
    const seenProductIds = new Set<string>();
    const now = new Date();
    let requiresReservationKey = false;

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
      if (product.productType !== "perfume" && seenProductIds.has(productId)) {
        return NextResponse.json(
          { error: `${product.name} can only appear once in an order.` },
          { status: 400 }
        );
      }

      if (product.productType === "perfume") {
        const reservedQuantity = await Order.aggregate([
          { $match: { orderStatus: { $in: ["processing", "confirmed", "shipping", "delivered"] } } },
          { $unwind: "$items" },
          { $match: { "items.product": product._id } },
          { $group: { _id: null, total: { $sum: "$items.quantity" } } },
        ]);

        const remainingStock = Math.max(product.stock - (reservedQuantity[0]?.total || 0), 0);
        if (item.quantity < 1 || item.quantity > remainingStock) {
          return NextResponse.json(
            { error: `${product.name} does not have enough stock available.` },
            { status: 400 }
          );
        }
      } else {
        requiresReservationKey = true;

        if (item.quantity !== 1) {
          return NextResponse.json(
            { error: `${product.name} is a unique item and can only be ordered once.` },
            { status: 400 }
          );
        }

        const existingConfirmedOrder = await Order.exists({
          orderStatus: { $in: BLOCKING_ORDER_STATUSES },
          "items.product": product._id,
        });

        if (existingConfirmedOrder) {
          return NextResponse.json(
            { error: `${product.name} is no longer available.` },
            { status: 409 }
          );
        }

        const activeReservation = await ProductReservation.findOne({
          product: product._id,
          reservedUntil: { $gt: now },
        }).lean();

        if (!reservationKey) {
          return NextResponse.json(
            { error: "Reservation expired. Please add the product to cart again." },
            { status: 400 }
          );
        }

        if (!activeReservation || activeReservation.reservationKey !== reservationKey) {
          return NextResponse.json(
            { error: `${product.name} is no longer reserved for you. Please add it to cart again.` },
            { status: 409 }
          );
        }
      }

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

    if (requiresReservationKey && !reservationKey) {
      return NextResponse.json(
        { error: "Reservation expired. Please add the product to cart again." },
        { status: 400 }
      );
    }

    const order = await Order.create({
      user: session.userId,
      items: orderItems,
      shippingAddress,
      paymentMethod: "cod",
      orderStatus: "processing",
      totalPrice,
    });

    if (reservationKey) {
      await ProductReservation.deleteMany({
        reservationKey,
        product: { $in: orderItems.map((item) => item.product) },
      });
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (error: unknown) {
    console.error("Create order error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
