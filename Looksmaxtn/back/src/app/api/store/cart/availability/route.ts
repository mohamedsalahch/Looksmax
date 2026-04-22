import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";
import { buildSizeAvailability, getSizeStockEntries } from "@/lib/sizeAvailability";

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
        .select("_id stock sizeStock productType fashionSubtype images originPictures isActive")
        .lean(),
      ProductReservation.find({
        product: { $in: ids },
        reservedUntil: { $gt: now },
      })
        .select("product reservationKey reservedUntil quantity size")
        .lean(),
    ]);
    const activeOrderHoldMap = await getActiveOrderHoldMapByProductIds(ids, session?.userId || null);

    const productsMap = new Map(products.map((product) => [product._id.toString(), product]));

    const reservationsMap = reservations.reduce((map, reservation) => {
      const productId = reservation.product.toString();
      const current = map.get(productId) || [];
      current.push({
        reservationKey: reservation.reservationKey,
        reservationExpiresAt: reservation.reservedUntil.toISOString(),
        quantity: Math.max(1, Number(reservation.quantity) || 1),
        size: reservation.size || "",
      });
      map.set(productId, current);
      return map;
    }, new Map<string, Array<{ reservationKey: string; reservationExpiresAt: string; quantity: number; size: string }>>());

    return NextResponse.json({
      items: ids.map((productId) => {
        const product = productsMap.get(productId);
        const productReservations = reservationsMap.get(productId) || [];
        const activeOrderHold = activeOrderHoldMap.get(productId);
        const mainImage =
          product?.images?.find((image: { url: string; isMain: boolean }) => image.isMain)?.url ||
          product?.images?.[0]?.url ||
          "";

        const sizeStockEntries = getSizeStockEntries(product?.sizeStock);
        const hasSizeStock = sizeStockEntries.length > 0;

        const sizeAvailability = hasSizeStock && product
          ? buildSizeAvailability(product.sizeStock, productReservations, key)
          : null;

        const remainingStock = Math.max(product?.stock ?? 0, 0);
        const reservedByOthers = productReservations.reduce((sum, reservation) => {
          if (reservation.reservationKey === key) return sum;
          return sum + reservation.quantity;
        }, 0);
        const ownedQuantity = productReservations.reduce((sum, reservation) => {
          if (reservation.reservationKey !== key) return sum;
          return sum + reservation.quantity;
        }, 0);
        const hasSelectableSize = hasSizeStock
          ? Object.values(sizeAvailability || {}).some((sizeInfo) => sizeInfo.available)
          : remainingStock > 0;
        const reservedElsewhere = hasSizeStock
          ? Object.values(sizeAvailability || {}).some((sizeInfo) => sizeInfo.reservedElsewhere)
          : reservedByOthers > 0 && (reservedByOthers >= remainingStock || reservedByOthers + ownedQuantity > remainingStock);

        const ownedReservationEntry = key
          ? productReservations.find((reservation) => reservation.reservationKey === key) || null
          : null;

        const available = hasSizeStock
          ? hasSelectableSize
          : remainingStock > 0;

        return {
          productId,
          available,
          blockedByOrder: false,
          maxStock: Math.max(hasSizeStock ? remainingStock : remainingStock, 1),
          productType: normalizeProductType(product?.productType),
          fashionSubtype: product?.fashionSubtype || "clothes",
          originPictures: product?.originPictures || { front: "", back: "", left: "", right: "" },
          image: mainImage,
          cartCount: productReservations.reduce((sum, reservation) => sum + reservation.quantity, 0),
          reservedElsewhere,
          ownedReservation: Boolean(ownedReservationEntry) || Boolean(activeOrderHold?.ownedReservation),
          reservationExpiresAt: ownedReservationEntry ? ownedReservationEntry.reservationExpiresAt : null,
          sizeAvailability,
        };
      }),
    });
  } catch (error: unknown) {
    console.error("Cart availability error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await dbConnect();

    const { reservationKey, cartKey } = await req.json();
    const session = await getSession();
    const key = session?.userId ? `user:${session.userId}` : cartKey || reservationKey;

    if (!key) {
      return NextResponse.json({ error: "Missing cart key" }, { status: 400 });
    }

    await ProductReservation.deleteMany({ reservationKey: key });

    return NextResponse.json({ success: true, cartCount: 0 });
  } catch (error: unknown) {
    console.error("Release cart availability error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
