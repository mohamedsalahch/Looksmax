import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Order from "@/store/models/Order";
import mongoose from "mongoose";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!mongoose.Types.ObjectId.isValid(id) || !token) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await dbConnect();
    const order = await Order.findById(id).lean();

    if (!order || !order.guestAccessToken || !timingSafeEqual(order.guestAccessToken, token)) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      order: {
        _id: order._id,
        orderStatus: order.orderStatus,
        items: order.items,
        shippingAddress: order.shippingAddress,
        paymentMethod: order.paymentMethod,
        subtotalPrice: order.subtotalPrice,
        shippingFee: order.shippingFee,
        couponCode: order.couponCode,
        couponDiscountAmount: order.couponDiscountAmount,
        totalPrice: order.totalPrice,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    console.error("Track order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
