import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";
import { filterAndRankProducts } from "@/store/lib/productSearch";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";
import {
  buildSizeAvailability,
  getDisplayStock,
  getSizeStockEntries,
} from "@/lib/sizeAvailability";
import { isStoreOwnerApproved } from "@/store/lib/storeApproval";

function uniqueSortedValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const brand = searchParams.get("brand");
    const size = searchParams.get("size");
    const sizes = size
      ? size.split(",").map((value) => value.trim()).filter(Boolean)
      : [];
    const color = searchParams.get("color");
    const availability = searchParams.get("availability");
    const priceMin = Number(searchParams.get("priceMin") || "");
    const priceMax = Number(searchParams.get("priceMax") || "");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "24");
    const includeFacets = searchParams.get("includeFacets") === "1";

    const filter: Record<string, unknown> = {
      $or: [{ approvalStatus: "approved" }, { approvalStatus: { $exists: false } }],
    };
    if (category === "new-arrivals" || category === "new") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filter.createdAt = { $gte: weekAgo };
    } else if (category) {
      filter.categories = category; // MongoDB matches if the array contains this value
    }

    const skip = (page - 1) * limit;

    const products = await Product.find(filter)
      .sort(category === "new" ? { createdAt: -1 } : { createdAt: -1 })
      .lean();
    const ownerIds = [...new Set(
      products
        .map((product) => product.createdBy?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )];
    const owners = ownerIds.length > 0
      ? await User.find({ _id: { $in: ownerIds } })
          .select("_id role storeApprovalStatus storeType storeName name")
          .lean()
      : [];
    const approvedOwnerIds = new Set(
      owners
        .filter((owner) => isStoreOwnerApproved(owner))
        .map((owner) => owner._id.toString())
    );
    const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));
    const now = new Date();
    const activeReservations = await ProductReservation.find({ reservedUntil: { $gt: now } })
      .select("product reservationKey quantity size")
      .lean();
    const activeOrderHoldMap = await getActiveOrderHoldMapByProductIds(
      products.map((product) => product._id.toString()),
      session?.userId || null
    );
    const reservationKey = session?.userId ? `user:${session.userId}` : (searchParams.get("rk") || null);
    const reservationMap = activeReservations.reduce((map, reservation) => {
      const productId = reservation.product.toString();
      const current =
        map.get(productId) || {
          totalQuantity: 0,
          ownedQuantity: 0,
        };
      const quantity = Math.max(1, Number(reservation.quantity) || 1);
      current.totalQuantity += quantity;
      if (reservationKey && reservation.reservationKey === reservationKey) {
        current.ownedQuantity += quantity;
      }
      map.set(productId, current);
      return map;
    }, new Map<string, { totalQuantity: number; ownedQuantity: number }>());

    const productsWithAvailability = products.map((product) => {
      const ownerId = product.createdBy?.id || "";
      if (ownerId && !approvedOwnerIds.has(ownerId)) {
        return null;
      }
      const stock = Math.max(product.stock ?? 0, 0);
      const reservationInfo = reservationMap.get(product._id.toString()) || {
        totalQuantity: 0,
        ownedQuantity: 0,
      };
      const activeOrderHold = activeOrderHoldMap.get(product._id.toString());
      const sizeStockEntries = getSizeStockEntries(product.sizeStock);
      const sizeAvailability = sizeStockEntries.length > 0
        ? buildSizeAvailability(product.sizeStock, activeReservations, reservationKey)
        : null;
      const reservedByOthers = reservationInfo.totalQuantity - reservationInfo.ownedQuantity;
      const displayStock = sizeAvailability
        ? getDisplayStock(stock, sizeAvailability)
        : Math.max(stock - reservedByOthers, 0);

      const hasSelectableSize = sizeAvailability
        ? Object.values(sizeAvailability as Record<string, { available: boolean }>).some((sizeInfo) => sizeInfo.available)
        : displayStock > 0;
      const reservedElsewhere = sizeAvailability
        ? Object.values(sizeAvailability as Record<string, { reservedElsewhere: boolean }>).some((sizeInfo) => sizeInfo.reservedElsewhere)
        : reservedByOthers > 0 && (reservedByOthers >= stock || reservedByOthers + reservationInfo.ownedQuantity > stock);
      const blockedByOrder = sizeAvailability
        ? Boolean(activeOrderHold) && !hasSelectableSize
        : Boolean(activeOrderHold) && displayStock <= 0;

      const owner = ownerMap.get(ownerId);
      const colorImagesData = product.colorImages instanceof Map
        ? Object.fromEntries(product.colorImages)
        : (product.colorImages && typeof product.colorImages === "object" ? product.colorImages : null);

      return {
        ...product,
        stock: displayStock,
        cartCount: reservationInfo.totalQuantity,
        blockedByOrder,
        reservedElsewhere,
        ownedReservation: reservationInfo.ownedQuantity > 0,
        sizeAvailability,
        storeType: owner?.role === "store_owner" ? (owner as { storeType?: string }).storeType || null : null,
        storeName: (owner as { storeName?: string; name?: string } | undefined)?.storeName || product.createdBy?.name || "",
        colorImages: colorImagesData,
      };
    });

    const visibleProducts = productsWithAvailability.filter(
      (product): product is NonNullable<(typeof productsWithAvailability)[number]> => product !== null
    );

    const searchMatchedProducts = search
      ? filterAndRankProducts(visibleProducts as any[], search)
      : visibleProducts;

    const filteredProducts = (searchMatchedProducts as any[]).filter((product) => {
      if (product.isActive === false) return false;
      if (product.approvalStatus && product.approvalStatus !== "approved") return false;
      const stock = Math.max(product.stock ?? 0, 0);
      const hasSelectableSize = product.sizeAvailability
        ? Object.values(product.sizeAvailability).some((sizeInfo) => sizeInfo.available)
        : stock > 0;
      if (brand && product.brand !== brand) return false;
      if (sizes.length > 0 && !sizes.some((sizeValue) => (product.sizes || []).includes(sizeValue))) return false;
      if (color && !(product.colors || []).includes(color)) return false;
      if (availability === "out-of-stock") return !hasSelectableSize;
      if (availability === "in-stock") return hasSelectableSize;
      if (Number.isFinite(priceMin) && product.price < priceMin) return false;
      if (Number.isFinite(priceMax) && priceMax > 0 && product.price > priceMax) return false;
      return true;
    });

    const facetsSource = searchMatchedProducts;
    const facets = includeFacets
      ? {
          categories: uniqueSortedValues(facetsSource.flatMap((product) => product.categories || [])),
          brands: uniqueSortedValues(facetsSource.map((product) => product.brand || "")),
          sizes: uniqueSortedValues(facetsSource.flatMap((product) => product.sizes || [])),
          colors: uniqueSortedValues(facetsSource.flatMap((product) => product.colors || [])),
          priceRange: {
            min: facetsSource.length > 0 ? Math.min(...facetsSource.map((product) => product.price || 0)) : 0,
            max: facetsSource.length > 0 ? Math.max(...facetsSource.map((product) => product.price || 0)) : 0,
          },
        }
      : undefined;

    const nowMs = Date.now();
    const productsWithEffectiveTag = filteredProducts.map((product) => {
      const rawTag = typeof product.tag === "string" ? product.tag : "";
      if (rawTag.toUpperCase() === "NEW") {
        const durationDays = Math.max(1, Number(product.newTagDurationDays) || 3);
        const createdMs = product.createdAt ? new Date(product.createdAt).getTime() : 0;
        const expired = createdMs > 0 && nowMs - createdMs > durationDays * 86400000;
        if (expired) return { ...product, tag: "" };
      }
      return product;
    });

    const tagRank = (tag: unknown) => {
      const value = typeof tag === "string" ? tag.toUpperCase() : "";
      if (value === "NEW") return 0;
      if (value === "FAVORITE") return 1;
      return 2;
    };
    const sortedProducts = [...productsWithEffectiveTag].sort((a, b) => {
      const rankDiff = tagRank(a.tag) - tagRank(b.tag);
      if (rankDiff !== 0) return rankDiff;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    const total = sortedProducts.length;
    const paginatedProducts = sortedProducts.slice(skip, skip + limit);

    return NextResponse.json({
      products: paginatedProducts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      facets,
    });
  } catch (error: unknown) {
    console.error("Get products error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const body = await req.json();
    const product = await Product.create(body);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error: unknown) {
    console.error("Create product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
