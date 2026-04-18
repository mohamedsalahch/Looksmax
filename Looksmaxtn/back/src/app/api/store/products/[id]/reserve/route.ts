import { NextRequest, NextResponse } from "next/server";
import dbConnect, { cleanupProductReservationIndexes } from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";
import mongoose from "mongoose";

const CART_PRESENCE_DURATION_MS = 30 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id } = await params;
    const { reservationKey, cartKey, quantity } = await req.json();
    const session = await getSession();
    const key = session?.userId ? `user:${session.userId}` : cartKey || reservationKey;
    const requestedQuantity = Math.max(1, Number(quantity) || 1);

    if (!key) {
      return NextResponse.json({ error: "Missing cart key" }, { status: 400 });
    }

    const now = new Date();
    const reservedUntil = new Date(now.getTime() + CART_PRESENCE_DURATION_MS);
    const activeOrderHoldMap = await getActiveOrderHoldMapByProductIds([id], session?.userId || null);
    const activeOrderHold = activeOrderHoldMap.get(id);

    await ProductReservation.deleteMany({ reservedUntil: { $lte: now } });

    const [product, activeReservations] = await Promise.all([
      Product.findById(id).lean(),
      ProductReservation.find({ product: id, reservedUntil: { $gt: now } })
        .select("reservationKey quantity")
        .lean(),
    ]);

    if (!product || Math.max(product.stock ?? 0, 0) <= 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (activeOrderHold && Math.max(product.stock ?? 0, 0) <= 0) {
      return NextResponse.json(
        { error: "This product is already reserved in an active order." },
        { status: 409 }
      );
    }

    let cartPresence: { reservedUntil?: Date } | null = null;
    try {
      cartPresence = await ProductReservation.findOneAndUpdate(
        { product: id, reservationKey: key },
        {
          product: id,
          reservationKey: key,
          quantity: requestedQuantity,
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
          quantity: requestedQuantity,
          reservedUntil,
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      ).lean();
    }

    const cartCount = await ProductReservation.aggregate<{ _id: null; cartCount: number }>([
      {
        $match: {
          product: new mongoose.Types.ObjectId(id),
          reservedUntil: { $gt: now },
        },
      },
      {
        $group: {
          _id: null,
          cartCount: { $sum: { $ifNull: ["$quantity", 1] } },
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      cartCount: cartCount[0]?.cartCount || 0,
      reservationExpiresAt: cartPresence?.reservedUntil?.toISOString(),
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

    const cartCount = await ProductReservation.aggregate<{ _id: null; cartCount: number }>([
      {
        $match: {
          product: new mongoose.Types.ObjectId(id),
          reservedUntil: { $gt: new Date() },
        },
      },
      {
        $group: {
          _id: null,
          cartCount: { $sum: { $ifNull: ["$quantity", 1] } },
        },
      },
    ]);

    return NextResponse.json({ success: true, cartCount: cartCount[0]?.cartCount || 0 });
  } catch (error: unknown) {
    console.error("Release cart presence error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
