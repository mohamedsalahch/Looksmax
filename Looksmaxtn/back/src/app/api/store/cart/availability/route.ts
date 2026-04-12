import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";

function normalizeProductType(value?: string) {
  return value === "perfume" ? "perfume" : "fashion";
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const { productIds, reservationKey, cartKey } = await req.json();
    const session = await getSession();
    const key = session?.userId ? `user:${session.userId}` : cartKey || reservationKey;

    if (!Array.isArray(productIds)) {
      return NextResponse.json({ error: "Invalid cart availability request" }, { status: 400 });
    }

    const now = new Date();
    const ids = [...new Set(productIds.filter((id): id is string => typeof id === "string" && id.length > 0))];

    const [products, reservations] = await Promise.all([
      Product.find({ _id: { $in: ids } })
        .select("_id stock productType fashionSubtype images originPictures isActive")
        .lean(),
      ProductReservation.find({
        product: { $in: ids },
        reservedUntil: { $gt: now },
      })
        .select("product reservationKey reservedUntil")
        .lean(),
    ]);

    const productsMap = new Map(products.map((product) => [product._id.toString(), product]));

    const reservationMap = new Map(
      reservations.map((reservation) => [
        reservation.product.toString(),
        {
          reservationKey: reservation.reservationKey,
          reservationExpiresAt: reservation.reservedUntil.toISOString(),
        },
      ])
    );
    const cartCountMap = reservations.reduce((map, reservation) => {
      const productId = reservation.product.toString();
      map.set(productId, (map.get(productId) || 0) + 1);
      return map;
    }, new Map<string, number>());

    return NextResponse.json({
      items: ids.map((productId) => {
        const product = productsMap.get(productId);
        const reservation = reservationMap.get(productId);
        const ownedReservation = key ? reservation?.reservationKey === key : Boolean(reservation);
        const mainImage =
          product?.images?.find((image: { url: string; isMain: boolean }) => image.isMain)?.url ||
          product?.images?.[0]?.url ||
          "";
        const remainingStock = Math.max(product?.stock ?? 0, 0);
        const blockedByOrder = remainingStock <= 0;

        return {
          productId,
          available: product?.isActive !== false && remainingStock > 0,
          blockedByOrder,
          maxStock: remainingStock,
          productType: normalizeProductType(product?.productType),
          fashionSubtype: product?.fashionSubtype || "clothes",
          originPictures: product?.originPictures || { front: "", back: "", left: "", right: "" },
          image: mainImage,
          cartCount: cartCountMap.get(productId) || 0,
          reservationExpiresAt: ownedReservation ? reservation?.reservationExpiresAt ?? null : null,
        };
      }),
    });
  } catch (error: unknown) {
    console.error("Cart availability error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
