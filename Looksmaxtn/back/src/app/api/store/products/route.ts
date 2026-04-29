import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import { filterAndRankProducts } from "@/store/lib/productSearch";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";
import {
  buildSizeAvailability,
  getDisplayStock,
  getSizeStockEntries,
} from "@/lib/sizeAvailability";

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
    const color = searchParams.get("color");
    const availability = searchParams.get("availability");
    const priceMin = Number(searchParams.get("priceMin") || "");
    const priceMax = Number(searchParams.get("priceMax") || "");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "24");
    const includeFacets = searchParams.get("includeFacets") === "1";

    const filter: Record<string, unknown> = {};
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
        ? Object.values(sizeAvailability).some((sizeInfo) => sizeInfo.available)
        : displayStock > 0;
      const reservedElsewhere = sizeAvailability
        ? Object.values(sizeAvailability).some((sizeInfo) => sizeInfo.reservedElsewhere)
        : reservedByOthers > 0 && (reservedByOthers >= stock || reservedByOthers + reservationInfo.ownedQuantity > stock);
      const blockedByOrder = sizeAvailability
        ? Boolean(activeOrderHold) && !hasSelectableSize
        : Boolean(activeOrderHold) && displayStock <= 0;

      return {
        ...product,
        stock: displayStock,
        cartCount: reservationInfo.totalQuantity,
        blockedByOrder,
        reservedElsewhere,
        ownedReservation: reservationInfo.ownedQuantity > 0,
        sizeAvailability,
      };
    });

    const searchMatchedProducts = search
      ? filterAndRankProducts(productsWithAvailability, search)
      : productsWithAvailability;

    const filteredProducts = searchMatchedProducts.filter((product) => {
      if (product.isActive === false) return false;
      const stock = Math.max(product.stock ?? 0, 0);
      const hasSelectableSize = product.sizeAvailability
        ? Object.values(product.sizeAvailability).some((sizeInfo) => sizeInfo.available)
        : stock > 0;
      if (brand && product.brand !== brand) return false;
      if (size && !(product.sizes || []).includes(size)) return false;
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
