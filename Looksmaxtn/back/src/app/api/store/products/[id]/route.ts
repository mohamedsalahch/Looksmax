import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";
import {
  buildSizeAvailability,
  getDisplayStock,
  getSizeStockEntries,
} from "@/lib/sizeAvailability";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;
    const session = await getSession();
    const now = new Date();
    const reservationKey = session?.userId ? `user:${session.userId}` : null;
    const [product, activeReservations] = await Promise.all([
      Product.findById(id).lean(),
      ProductReservation.find({ product: id, reservedUntil: { $gt: now } })
        .select("reservationKey quantity size")
        .lean(),
    ]);
    const activeOrderHoldMap = await getActiveOrderHoldMapByProductIds([id], session?.userId || null);
    const activeOrderHold = activeOrderHoldMap.get(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const ownedReservationQuantity = activeReservations
      .filter((reservation) => reservation.reservationKey === reservationKey)
      .reduce((sum, reservation) => sum + Math.max(1, Number(reservation.quantity) || 1), 0);
    const reservedByOthersQuantity = activeReservations
      .filter((reservation) => reservation.reservationKey !== reservationKey)
      .reduce((sum, reservation) => sum + Math.max(1, Number(reservation.quantity) || 1), 0);
    const stock = Math.max(product.stock ?? 0, 0);
    const sizeStockEntries = getSizeStockEntries(product.sizeStock);
    const hasSizeStock = sizeStockEntries.length > 0;
    const sizeAvailability = hasSizeStock
      ? buildSizeAvailability(product.sizeStock, activeReservations, reservationKey)
      : null;
    const displayStock = hasSizeStock ? getDisplayStock(stock, sizeAvailability) : Math.max(stock - reservedByOthersQuantity, 0);
    const ownedReservation = ownedReservationQuantity > 0;
    const anySizeAvailable = hasSizeStock
      ? Object.values(sizeAvailability || {}).some((sizeInfo) => sizeInfo.available)
      : displayStock > 0;
    const blockedByOrder = hasSizeStock
      ? Boolean(activeOrderHold) && !anySizeAvailable
      : Boolean(activeOrderHold) && displayStock <= 0;

    if (product.isActive === false && !anySizeAvailable && !blockedByOrder && reservedByOthersQuantity <= 0 && !ownedReservation) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const reservedElsewhere = hasSizeStock
      ? Object.values(sizeAvailability || {}).some((size) => size.reservedElsewhere)
      : reservedByOthersQuantity > 0 && (reservedByOthersQuantity >= stock || reservedByOthersQuantity + ownedReservationQuantity > stock);

    return NextResponse.json({
      product: {
        ...product,
        stock: displayStock,
        cartCount: 0,
        blockedByOrder,
        reservedElsewhere,
        ownedReservation,
        reservationExpiresAt: null,
        sizeAvailability,
      },
    });
  } catch (error: unknown) {
    console.error("Get product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const body = await req.json();
    const product = await Product.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (error: unknown) {
    console.error("Update product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Delete product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
