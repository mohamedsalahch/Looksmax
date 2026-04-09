import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Order from "@/store/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import { filterAndRankProducts } from "@/store/lib/productSearch";

const BLOCKING_ORDER_STATUSES = ["processing", "confirmed", "shipping"];
const ACTIVE_STOCK_ORDER_STATUSES = ["processing", "confirmed", "shipping", "delivered"];

function uniqueSortedValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
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

    const filter: Record<string, unknown> = { isActive: true };
    if (category === "new-arrivals" || category === "new") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filter.createdAt = { $gte: weekAgo };
    } else if (category) {
      filter.categories = category; // MongoDB matches if the array contains this value
    }

    const skip = (page - 1) * limit;

    const now = new Date();

    const [products, activeOrders, activeReservations] = await Promise.all([
      Product.find(filter)
        .sort(category === "new" ? { createdAt: -1 } : { createdAt: -1 })
        .lean(),
      Order.find({ orderStatus: { $in: ACTIVE_STOCK_ORDER_STATUSES } })
        .select("orderStatus items.product items.quantity")
        .lean(),
      ProductReservation.find({ reservedUntil: { $gt: now } })
        .select("product reservedUntil")
        .lean(),
    ]);

    const reservedSet = new Set<string>();
    const hiddenSet = new Set<string>();
    const perfumeQuantityMap = new Map<string, number>();

    activeOrders.forEach((order) => {
      order.items.forEach((item) => {
        const productId = item.product?.toString();
        if (!productId) return;
        perfumeQuantityMap.set(productId, (perfumeQuantityMap.get(productId) || 0) + (item.quantity || 0));
        if (BLOCKING_ORDER_STATUSES.includes(order.orderStatus)) {
          reservedSet.add(productId);
        }
        if (order.orderStatus === "delivered") {
          hiddenSet.add(productId);
        }
      });
    });

    const reservationMap = new Map(
      activeReservations.map((reservation) => [
        reservation.product.toString(),
        reservation.reservedUntil.toISOString(),
      ])
    );
    const visibleProducts = products.filter(
      (product) => !(product.productType !== "perfume" && hiddenSet.has(product._id.toString()))
    );

    const productsWithAvailability = visibleProducts.map((product) => ({
      ...product,
      stock:
        product.productType === "perfume"
          ? Math.max((product.stock ?? 0) - (perfumeQuantityMap.get(product._id.toString()) || 0), 0)
          : reservedSet.has(product._id.toString()) || reservationMap.has(product._id.toString())
            ? 0
            : Math.min(product.stock ?? 1, 1),
      reservationExpiresAt:
        product.productType === "perfume"
          ? null
          : reservationMap.get(product._id.toString()) || null,
    }));

    const searchMatchedProducts = search
      ? filterAndRankProducts(productsWithAvailability, search)
      : productsWithAvailability;

    const filteredProducts = searchMatchedProducts.filter((product) => {
      if (brand && product.brand !== brand) return false;
      if (size && !(product.sizes || []).includes(size)) return false;
      if (color && !(product.colors || []).includes(color)) return false;
      if (availability === "in-stock" && product.stock <= 0) return false;
      if (availability === "out-of-stock" && product.stock > 0) return false;
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
