import { NextRequest, NextResponse } from "next/server";
import dbConnect, { cleanupProductReservationIndexes } from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import mongoose from "mongoose";

const CART_PRESENCE_DURATION_MS = 30 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id } = await params;
    const { reservationKey, cartKey } = await req.json();
    const session = await getSession();
    const key = session?.userId ? `user:${session.userId}` : cartKey || reservationKey;

    if (!key) {
      return NextResponse.json({ error: "Missing cart key" }, { status: 400 });
    }

    const now = new Date();
    const reservedUntil = new Date(now.getTime() + CART_PRESENCE_DURATION_MS);

    await ProductReservation.deleteMany({ reservedUntil: { $lte: now } });

    const product = await Product.findById(id).lean();

    if (!product || product.isActive === false) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    let cartPresence: { reservedUntil?: Date } | null = null;
    try {
      cartPresence = await ProductReservation.findOneAndUpdate(
        { product: id, reservationKey: key },
        {
          product: id,
          reservationKey: key,
          reservedUntil,
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      ).lean();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const isDuplicateReservationIndexError =
        error instanceof mongoose.mongo.MongoServerError &&
        error.code === 11000 &&
        message.includes("product_1");

      if (!isDuplicateReservationIndexError) {
        throw error;
      }

      await cleanupProductReservationIndexes(mongoose);

      cartPresence = await ProductReservation.findOneAndUpdate(
        { product: id, reservationKey: key },
        {
          product: id,
          reservationKey: key,
          reservedUntil,
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      ).lean();
    }

    const cartCount = await ProductReservation.countDocuments({
      product: id,
      reservedUntil: { $gt: now },
    });

    return NextResponse.json({
      success: true,
      cartCount,
      reservationExpiresAt: cartPresence?.reservedUntil.toISOString(),
    });
  } catch (error: unknown) {
    console.error("Track cart presence error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id } = await params;
    const { reservationKey, cartKey } = await req.json();
    const session = await getSession();
    const key = session?.userId ? `user:${session.userId}` : cartKey || reservationKey;

    if (!key) {
      return NextResponse.json({ error: "Missing cart key" }, { status: 400 });
    }

    await ProductReservation.deleteOne({ product: id, reservationKey: key });

    const cartCount = await ProductReservation.countDocuments({
      product: id,
      reservedUntil: { $gt: new Date() },
    });

    return NextResponse.json({ success: true, cartCount });
  } catch (error: unknown) {
    console.error("Release cart presence error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
