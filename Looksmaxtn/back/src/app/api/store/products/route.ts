import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import { filterAndRankProducts } from "@/store/lib/productSearch";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";

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
      .select("product reservationKey quantity")
      .lean();
    const activeOrderHoldMap = await getActiveOrderHoldMapByProductIds(
      products.map((product) => product._id.toString()),
      session?.userId || null
    );
    const reservationKey = session?.userId ? `user:${session.userId}` : null;
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
      const blockedByOrder = Boolean(activeOrderHold) && stock <= 0;
      const reservedByOthers = reservationInfo.totalQuantity - reservationInfo.ownedQuantity;
      const reservedElsewhere = reservedByOthers > 0 && reservedByOthers >= stock;
      return {
        ...product,
        stock,
        cartCount: reservationInfo.totalQuantity,
        blockedByOrder,
        reservedElsewhere,
        ownedReservation: reservationInfo.ownedQuantity > 0,
      };
    });

    const searchMatchedProducts = search
      ? filterAndRankProducts(productsWithAvailability, search)
      : productsWithAvailability;

    const filteredProducts = searchMatchedProducts.filter((product) => {
      const stock = Math.max(product.stock ?? 0, 0);
      if (brand && product.brand !== brand) return false;
      if (size && !(product.sizes || []).includes(size)) return false;
      if (color && !(product.colors || []).includes(color)) return false;
      const blockedByOrder = Boolean(product.blockedByOrder);
      if (availability === "out-of-stock") return stock <= 0;
      if (availability === "in-stock") return stock > 0;
      if (stock <= 0 && !blockedByOrder) return false;
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

    const total = filteredProducts.length;
    const paginatedProducts = filteredProducts.slice(skip, skip + limit);

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
