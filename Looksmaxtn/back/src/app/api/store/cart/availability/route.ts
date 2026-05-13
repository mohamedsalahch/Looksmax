import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";
import {
  buildVariantAvailability,
  type VariantLike,
} from "@/lib/variantAvailability";
import { isStoreOwnerApproved } from "@/store/lib/storeApproval";

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
        .select("_id stock variants productType fashionSubtype images originPictures isActive approvalStatus createdBy")
        .lean(),
      ProductReservation.find({
        product: { $in: ids },
        reservedUntil: { $gt: now },
      })
        .select("product reservationKey reservedUntil quantity variant")
        .lean(),
    ]);
    const ownerIds = [...new Set(
      products
        .map((product) => product.createdBy?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )];
    const owners = ownerIds.length > 0
      ? await User.find({ _id: { $in: ownerIds } })
          .select("_id role storeApprovalStatus")
          .lean()
      : [];
    const approvedOwnerIds = new Set(
      owners
        .filter((owner) => isStoreOwnerApproved(owner))
        .map((owner) => owner._id.toString())
    );
    const activeOrderHoldMap = await getActiveOrderHoldMapByProductIds(ids, session?.userId || null);

    const productsMap = new Map(products.map((product) => [product._id.toString(), product]));

    const reservationsMap = reservations.reduce((map, reservation) => {
      const productId = reservation.product.toString();
      const current = map.get(productId) || [];
      current.push({
        reservationKey: reservation.reservationKey,
        reservationExpiresAt: reservation.reservedUntil.toISOString(),
        quantity: Math.max(1, Number(reservation.quantity) || 1),
        variant: reservation.variant,
      });
      map.set(productId, current);
      return map;
    }, new Map<string, Array<{ reservationKey: string; reservationExpiresAt: string; quantity: number; variant: unknown }>>());

    return NextResponse.json({
      items: ids.map((productId) => {
        const product = productsMap.get(productId);
        const ownerId = product?.createdBy?.id || "";
        if (ownerId && !approvedOwnerIds.has(ownerId)) {
          return {
            productId,
            available: false,
            blockedByOrder: false,
            maxStock: 1,
            productType: normalizeProductType(product?.productType),
            fashionSubtype: product?.fashionSubtype || "clothes",
            originPictures: product?.originPictures || { front: "", back: "", left: "", right: "" },
            image: product?.images?.find((image: { url: string; isMain: boolean }) => image.isMain)?.url ||
              product?.images?.[0]?.url ||
              "",
            cartCount: 0,
            reservedElsewhere: false,
            ownedReservation: false,
            reservationExpiresAt: null,
            variantAvailability: null,
          };
        }
        const productReservations = reservationsMap.get(productId) || [];
        const activeOrderHold = activeOrderHoldMap.get(productId);
        const mainImage =
          product?.images?.find((image: { url: string; isMain: boolean }) => image.isMain)?.url ||
          product?.images?.[0]?.url ||
          "";

        const variants = (product?.variants || []) as unknown as VariantLike[];
        const hasVariants = variants.length > 0;

        const variantAvailability = hasVariants
          ? buildVariantAvailability(variants, productReservations, key)
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
        const hasSelectableVariant = hasVariants
          ? Object.values(variantAvailability || {}).some((entry) => entry.available)
          : remainingStock > 0;
        const reservedElsewhere = hasVariants
          ? Object.values(variantAvailability || {}).some((entry) => entry.reservedElsewhere)
          : reservedByOthers > 0 && (reservedByOthers >= remainingStock || reservedByOthers + ownedQuantity > remainingStock);

        const ownedReservationEntry = key
          ? productReservations.find((reservation) => reservation.reservationKey === key) || null
          : null;

        const isApproved = !product?.approvalStatus || product.approvalStatus === "approved";
        const available = product?.isActive !== false && isApproved && (hasVariants
          ? hasSelectableVariant
          : remainingStock > 0);

        return {
          productId,
          available,
          blockedByOrder: false,
          maxStock: Math.max(remainingStock, 1),
          productType: normalizeProductType(product?.productType),
          fashionSubtype: product?.fashionSubtype || "clothes",
          originPictures: product?.originPictures || { front: "", back: "", left: "", right: "" },
          image: mainImage,
          cartCount: productReservations.reduce((sum, reservation) => sum + reservation.quantity, 0),
          reservedElsewhere,
          ownedReservation: Boolean(ownedReservationEntry) || Boolean(activeOrderHold?.ownedReservation),
          reservationExpiresAt: ownedReservationEntry ? ownedReservationEntry.reservationExpiresAt : null,
          variantAvailability,
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
