import { NextRequest, NextResponse } from "next/server";
import dbConnect, { cleanupProductReservationIndexes } from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";
import mongoose from "mongoose";

const CART_PRESENCE_DURATION_MS = 30 * 60 * 1000;

function getSizeStockEntries(
  sizeStock: unknown
): Array<[string, { fullStock?: number; stock?: number }]> {
  if (sizeStock instanceof Map) {
    return Array.from(sizeStock.entries());
  }

  if (!sizeStock || typeof sizeStock !== "object") return [];

  return Object.entries(sizeStock as Record<string, { fullStock?: number; stock?: number }>);
}

function getSizeStock(product: { stock?: number; sizeStock?: unknown }, size?: string) {
  if (size && product.sizeStock) {
    const entry = getSizeStockEntries(product.sizeStock).find(([entrySize]) => entrySize === size)?.[1];
    if (entry) return Math.max(entry.stock ?? 0, 0);
  }
  return Math.max(product.stock ?? 0, 0);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id } = await params;
    const { reservationKey, cartKey, quantity, size } = await req.json();
    const session = await getSession();
    const key = session?.userId ? `user:${session.userId}` : cartKey || reservationKey;
    const requestedQuantity = Math.max(1, Number(quantity) || 1);
    const normalizedSize = size || "";

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
      ProductReservation.find({
        product: id,
        reservedUntil: { $gt: now },
        ...(normalizedSize ? { size: normalizedSize } : {}),
      })
        .select("reservationKey quantity size")
        .lean(),
    ]);

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const sizeStockEntries = getSizeStockEntries(product.sizeStock);
    const sizeStock = getSizeStock(product, normalizedSize);
    const hasSizeStock = sizeStockEntries.length > 0;

    if (hasSizeStock && normalizedSize) {
      const otherReservationsQty = activeReservations
        .filter((r) => r.reservationKey !== key)
        .reduce((sum, r) => sum + Math.max(1, Number(r.quantity) || 1), 0);
      const availableForThisSize = Math.max(0, sizeStock - otherReservationsQty);

      if (availableForThisSize <= 0) {
        return NextResponse.json(
          { error: "This size is no longer available." },
          { status: 409 }
        );
      }
      if (requestedQuantity > availableForThisSize) {
        return NextResponse.json(
          { error: `Only ${availableForThisSize} left for size ${normalizedSize}.` },
          { status: 409 }
        );
      }
      if (activeOrderHold && sizeStock <= 0) {
        return NextResponse.json(
          { error: "This product is already reserved in an active order." },
          { status: 409 }
        );
      }
    } else if (Math.max(product.stock ?? 0, 0) <= 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    let cartPresence: { reservedUntil?: Date } | null = null;
    try {
      cartPresence = await ProductReservation.findOneAndUpdate(
        { product: id, reservationKey: key, size: normalizedSize },
        {
          product: id,
          reservationKey: key,
          size: normalizedSize,
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
        { product: id, reservationKey: key, size: normalizedSize },
        {
          product: id,
          reservationKey: key,
          size: normalizedSize,
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
    const { reservationKey, cartKey, size } = await req.json();
    const session = await getSession();
    const key = session?.userId ? `user:${session.userId}` : cartKey || reservationKey;
    const normalizedSize = size || "";

    if (!key) {
      return NextResponse.json({ error: "Missing cart key" }, { status: 400 });
    }

    await ProductReservation.deleteOne({ product: id, reservationKey: key, size: normalizedSize });

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
