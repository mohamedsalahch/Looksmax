import { NextRequest, NextResponse } from "next/server";
import dbConnect, { cleanupProductReservationIndexes } from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";
import { getSizeStockEntries } from "@/lib/sizeAvailability";
import { broadcastAvailabilityChange } from "@/lib/sseClients";
import mongoose from "mongoose";

const CART_PRESENCE_DURATION_MS = 30 * 60 * 1000;

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
    const hasSizeStock = sizeStockEntries.length > 0;

    if (hasSizeStock && normalizedSize) {
      const sizeStock = Math.max(
        sizeStockEntries.find(([entrySize]) => entrySize === normalizedSize)?.[1]?.stock ?? 0,
        0
      );
      if (sizeStock <= 0) {
        return NextResponse.json(
          { error: "This size is no longer available." },
          { status: 409 }
        );
      }
      if (requestedQuantity > sizeStock) {
        return NextResponse.json(
          { error: `Only ${sizeStock} left for size ${normalizedSize}.` },
          { status: 409 }
        );
      }
    } else {
      const availableStock = Math.max(product.stock ?? 0, 0);
      if (availableStock <= 0) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      if (requestedQuantity > availableStock) {
        return NextResponse.json(
          { error: `Only ${availableStock} left for this product.` },
          { status: 409 }
        );
      }
    }

    const existingReservation = await ProductReservation.findOne({
      product: id,
      reservationKey: key,
      size: normalizedSize,
      reservedUntil: { $gt: now },
    })
      .select("reservedUntil")
      .lean();

    const reservedUntil =
      existingReservation?.reservedUntil || new Date(now.getTime() + CART_PRESENCE_DURATION_MS);

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

    const allActiveReservations = await ProductReservation.find({
      product: id,
      reservedUntil: { $gt: now },
    }).select("reservationKey quantity size").lean();

    const finalCartCount = allActiveReservations.reduce(
      (sum, r) => sum + Math.max(1, Number(r.quantity) || 1), 0
    );

    broadcastAvailabilityChange({
      productId: id,
      stock: Math.max(product.stock ?? 0, 0),
      sizeStock: product.sizeStock,
      reservations: allActiveReservations,
    });

    return NextResponse.json({
      success: true,
      cartCount: finalCartCount,
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

    const now = new Date();
    const [allActiveReservations, productForBroadcast] = await Promise.all([
      ProductReservation.find({ product: id, reservedUntil: { $gt: now } })
        .select("reservationKey quantity size").lean(),
      Product.findById(id).select("stock sizeStock").lean(),
    ]);

    const finalCartCount = allActiveReservations.reduce(
      (sum, r) => sum + Math.max(1, Number(r.quantity) || 1), 0
    );

    broadcastAvailabilityChange({
      productId: id,
      stock: Math.max(productForBroadcast?.stock ?? 0, 0),
      sizeStock: productForBroadcast?.sizeStock,
      reservations: allActiveReservations,
    });

    return NextResponse.json({ success: true, cartCount: finalCartCount });
  } catch (error: unknown) {
    console.error("Release cart presence error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
