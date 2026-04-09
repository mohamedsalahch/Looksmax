import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Order from "@/store/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";

const RESERVATION_DURATION_MS = 60 * 1000;
const BLOCKING_ORDER_STATUSES = ["processing", "confirmed", "shipping"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id } = await params;
    const { reservationKey } = await req.json();

    if (!reservationKey) {
      return NextResponse.json({ error: "Missing reservation key" }, { status: 400 });
    }

    const now = new Date();
    const reservedUntil = new Date(now.getTime() + RESERVATION_DURATION_MS);

    await ProductReservation.deleteMany({ reservedUntil: { $lte: now } });

    const [product, confirmedOrder] = await Promise.all([
      Product.findById(id).lean(),
      Order.exists({ orderStatus: { $in: BLOCKING_ORDER_STATUSES }, "items.product": id }),
    ]);

    if (!product || product.isActive === false) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (product.productType === "perfume") {
      return NextResponse.json({ error: "Perfumes do not require reservation." }, { status: 400 });
    }

    if (confirmedOrder) {
      return NextResponse.json({ error: "This product is no longer available." }, { status: 409 });
    }

    const activeReservation = await ProductReservation.findOne({
      product: id,
      reservedUntil: { $gt: now },
    });

    if (activeReservation && activeReservation.reservationKey !== reservationKey) {
      return NextResponse.json(
        {
          error: "This product is temporarily reserved by another customer.",
          reservationExpiresAt: activeReservation.reservedUntil.toISOString(),
        },
        { status: 409 }
      );
    }

    const reservation = await ProductReservation.findOneAndUpdate(
      { product: id },
      {
        product: id,
        reservationKey,
        reservedUntil,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({
      success: true,
      reservationExpiresAt: reservation?.reservedUntil.toISOString(),
    });
  } catch (error: unknown) {
    console.error("Reserve product error:", error);
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
    const { reservationKey } = await req.json();

    if (!reservationKey) {
      return NextResponse.json({ error: "Missing reservation key" }, { status: 400 });
    }

    await ProductReservation.deleteOne({ product: id, reservationKey });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Release reservation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
