import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";
import { filterAndRankProducts } from "@/store/lib/productSearch";

function uniqueSortedValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const session = await getSession();
    const reservationKey = session?.userId ? `user:${session.userId}` : null;
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

    const [products, activeReservations] = await Promise.all([
      Product.find(filter)
        .sort(category === "new" ? { createdAt: -1 } : { createdAt: -1 })
        .lean(),
      ProductReservation.find({ reservedUntil: { $gt: now } })
        .select("product reservationKey reservedUntil")
        .lean(),
    ]);

    const reservationsByProduct = activeReservations.reduce((map, reservation) => {
      const productId = reservation.product.toString();
      const current = map.get(productId) || [];
      current.push({
        reservationKey: reservation.reservationKey,
        reservedUntil: reservation.reservedUntil,
      });
      map.set(productId, current);
      return map;
    }, new Map<string, Array<{ reservationKey: string; reservedUntil: Date }>>());
    const productsWithAvailability = products.map((product) => ({
      ...product,
      stock: Math.max(product.stock ?? 0, 0),
      cartCount: (reservationsByProduct.get(product._id.toString()) || []).length,
      reservedElsewhere: (reservationsByProduct.get(product._id.toString()) || []).some(
        (reservation) => reservation.reservationKey !== reservationKey
      ),
      ownedReservation: reservationKey
        ? (reservationsByProduct.get(product._id.toString()) || []).some(
            (reservation) => reservation.reservationKey === reservationKey
          )
        : false,
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
