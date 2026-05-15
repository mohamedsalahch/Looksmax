import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";
import {
  buildVariantAvailability,
  getDisplayStock,
  type VariantLike,
} from "@/lib/variantAvailability";
import { computeViewerBlocked } from "@/lib/sseClients";
import { isStoreOwnerApproved } from "@/store/lib/storeApproval";
import {
  averageVariantConditionScore,
  deriveColors,
  deriveSizes,
  normalizeStoredVariants,
} from "@/lib/productVariants";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;
    const session = await getSession();
    const now = new Date();
    const reservationKey = session?.userId ? `user:${session.userId}` : (req.nextUrl.searchParams.get("rk") || null);
    const [product, activeReservations] = await Promise.all([
      Product.findById(id).lean(),
      ProductReservation.find({ product: id, reservedUntil: { $gt: now } })
        .select("reservationKey quantity variant")
        .lean(),
    ]);
    const [activeOrderHoldMap, owner] = await Promise.all([
      getActiveOrderHoldMapByProductIds([id], session?.userId || null),
      product?.createdBy?.id
        ? User.findById(product.createdBy.id).select("storeName storeType name role storeApprovalStatus").lean()
        : Promise.resolve(null),
    ]);
    const activeOrderHold = activeOrderHoldMap.get(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (!isStoreOwnerApproved(owner)) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const variants = normalizeStoredVariants(product.variants) as VariantLike[];
    const ownedReservationQuantity = activeReservations
      .filter((reservation) => reservation.reservationKey === reservationKey)
      .reduce((sum, reservation) => sum + Math.max(1, Number(reservation.quantity) || 1), 0);
    const reservedByOthersQuantity = activeReservations
      .filter((reservation) => reservation.reservationKey !== reservationKey)
      .reduce((sum, reservation) => sum + Math.max(1, Number(reservation.quantity) || 1), 0);
    const stock = Math.max(product.stock ?? 0, 0);
    const hasVariants = variants.length > 0;
    const variantAvailability = hasVariants
      ? buildVariantAvailability(variants, activeReservations, reservationKey)
      : null;
    const displayStock = hasVariants
      ? getDisplayStock(stock, variantAvailability)
      : Math.max(stock - reservedByOthersQuantity, 0);
    const ownedReservation = ownedReservationQuantity > 0;
    const anyVariantAvailable = hasVariants
      ? Object.values(variantAvailability || {}).some((entry) => entry.available)
      : displayStock > 0;
    const blockedByOrder = hasVariants
      ? Boolean(activeOrderHold) && !anyVariantAvailable
      : Boolean(activeOrderHold) && displayStock <= 0;

    if (product.isActive === false || (product.approvalStatus && product.approvalStatus !== "approved")) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const reservedElsewhere = hasVariants
      ? Object.values(variantAvailability || {}).some((entry) => entry.reservedElsewhere)
      : reservedByOthersQuantity > 0 && (reservedByOthersQuantity >= stock || reservedByOthersQuantity + ownedReservationQuantity > stock);

    const viewerBlocked = computeViewerBlocked(
      variants,
      stock,
      activeReservations,
      reservationKey,
    );

    let effectiveTag = typeof product.tag === "string" ? product.tag : "";
    if (effectiveTag.toUpperCase() === "NEW") {
      const durationDays = Math.max(1, Number(product.newTagDurationDays) || 3);
      const createdMs = product.createdAt ? new Date(product.createdAt).getTime() : 0;
      if (createdMs > 0 && Date.now() - createdMs > durationDays * 86400000) {
        effectiveTag = "";
      }
    }

    const conditionScore = product.conditionScore != null
      ? product.conditionScore
      : averageVariantConditionScore(variants);

    return NextResponse.json({
      product: {
        ...product,
        conditionScore,
        tag: effectiveTag,
        stock: displayStock,
        cartCount: 0,
        blockedByOrder,
        reservedElsewhere,
        ownedReservation,
        storeName: owner?.storeName || product.createdBy?.name || "",
        storeType: owner?.role === "store_owner" ? owner?.storeType || null : null,
        reservationExpiresAt: null,
        variantAvailability,
        variants,
        sizes: deriveSizes(variants),
        colors: deriveColors(variants),
        viewerBlocked,
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
