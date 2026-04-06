import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Order from "@/store/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";

const ACTIVE_STOCK_ORDER_STATUSES = ["processing", "confirmed", "shipping", "delivered"] as const;
const UNIQUE_BLOCKING_STATUSES = ["processing", "confirmed", "shipping"] as const;

function normalizeProductType(value?: string) {
  return value === "perfume" ? "perfume" : "fashion";
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const { productIds, reservationKey, mode } = await req.json();

    if (!Array.isArray(productIds) || !reservationKey) {
      return NextResponse.json({ error: "Invalid cart availability request" }, { status: 400 });
    }

    const isRailMode = mode === "rail";

    const now = new Date();
    const ids = [...new Set(productIds.filter((id): id is string => typeof id === "string" && id.length > 0))];

    const [products, activeOrders, reservations] = await Promise.all([
      Product.find({ _id: { $in: ids } })
        .select("_id stock productType fashionSubtype images originPictures")
        .lean(),
      Order.find({
        orderStatus: { $in: ACTIVE_STOCK_ORDER_STATUSES },
        "items.product": { $in: ids },
      })
        .select("orderStatus items.product items.quantity")
        .lean(),
      ProductReservation.find({
        product: { $in: ids },
        reservedUntil: { $gt: now },
      })
        .select("product reservationKey reservedUntil")
        .lean(),
    ]);

    const productsMap = new Map(products.map((product) => [product._id.toString(), product]));
    const blockedSet = new Set<string>();
    const perfumeQuantityMap = new Map<string, number>();

    activeOrders.forEach((order) => {
      order.items.forEach((item) => {
        const productId = item.product?.toString();
        if (!productId) return;
        perfumeQuantityMap.set(productId, (perfumeQuantityMap.get(productId) || 0) + (item.quantity || 0));
        if (UNIQUE_BLOCKING_STATUSES.includes(order.orderStatus as (typeof UNIQUE_BLOCKING_STATUSES)[number])) {
          blockedSet.add(productId);
        }
      });
    });

    const reservationMap = new Map(
      reservations.map((reservation) => [
        reservation.product.toString(),
        {
          reservationKey: reservation.reservationKey,
          reservationExpiresAt: reservation.reservedUntil.toISOString(),
        },
      ])
    );

    return NextResponse.json({
      items: ids.map((productId) => {
        const product = productsMap.get(productId);
        const reservation = reservationMap.get(productId);
        const blockedByOrder = blockedSet.has(productId);
        const ownedReservation = reservation?.reservationKey === reservationKey;
        const mainImage =
          product?.images?.find((image: { url: string; isMain: boolean }) => image.isMain)?.url ||
          product?.images?.[0]?.url ||
          "";
        const remainingStock =
          product?.productType === "perfume"
            ? Math.max((product.stock ?? 0) - (perfumeQuantityMap.get(productId) || 0), 0)
            : 1;

        return {
          productId,
          available:
            product?.productType === "perfume"
              ? remainingStock > 0
              : isRailMode
                ? !blockedByOrder
                : !blockedByOrder && Boolean(ownedReservation),
          blockedByOrder,
          maxStock: product?.productType === "perfume" ? remainingStock : 1,
          productType: normalizeProductType(product?.productType),
          fashionSubtype: product?.fashionSubtype || "clothes",
          originPictures: product?.originPictures || { front: "", back: "", left: "", right: "" },
          image: mainImage,
          reservationExpiresAt:
            product?.productType === "perfume"
              ? null
              : ownedReservation
                ? reservation?.reservationExpiresAt ?? null
                : null,
        };
      }),
    });
  } catch (error: unknown) {
    console.error("Cart availability error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
