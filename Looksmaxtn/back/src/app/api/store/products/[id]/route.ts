import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";

function getSizeStockEntries(
  sizeStock: unknown
): Array<[string, { fullStock?: number; stock?: number }]> {
  if (sizeStock instanceof Map) {
    return Array.from(sizeStock.entries());
  }

  if (!sizeStock || typeof sizeStock !== "object") return [];

  return Object.entries(sizeStock as Record<string, { fullStock?: number; stock?: number }>);
}

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
    const cartReservedElsewhere = reservedByOthersQuantity > 0 && reservedByOthersQuantity >= stock;
    const blockedByOrder = Boolean(activeOrderHold) && stock <= 0;

    const sizeStockEntries = getSizeStockEntries(product.sizeStock);
    const hasSizeStock = sizeStockEntries.length > 0;
    const anySizeAvailable = hasSizeStock
      ? sizeStockEntries.some(([, entry]) => Math.max(entry.stock ?? 0, 0) > 0)
      : stock > 0;

    if (!anySizeAvailable && !blockedByOrder) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const reservedElsewhere = cartReservedElsewhere;
    const ownedReservation = ownedReservationQuantity > 0;

    let sizeAvailability: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null = null;
    if (hasSizeStock) {
      sizeAvailability = {};
      for (const [sz, entry] of sizeStockEntries) {
        const sizeReservations = activeReservations.filter((r) => (r.size || "") === sz);
        const sizeReservedByOthers = sizeReservations
          .filter((r) => r.reservationKey !== reservationKey)
          .reduce((sum, r) => sum + Math.max(1, Number(r.quantity) || 1), 0);
        const sizeStock = Math.max(entry.stock ?? 0, 0);
        sizeAvailability[sz] = {
          stock: sizeStock,
          available: product.isActive !== false && sizeStock > 0,
          reservedElsewhere: sizeReservedByOthers > 0 && sizeReservedByOthers >= sizeStock,
        };
      }
    }

    return NextResponse.json({
      product: {
        ...product,
        stock,
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
