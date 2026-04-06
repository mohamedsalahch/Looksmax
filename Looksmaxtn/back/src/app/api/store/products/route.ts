import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Order from "@/store/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import { getSession } from "@/store/lib/auth";

const BLOCKING_ORDER_STATUSES = ["processing", "confirmed", "shipping"];
const ACTIVE_STOCK_ORDER_STATUSES = ["processing", "confirmed", "shipping", "delivered"];

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "24");

    const filter: Record<string, unknown> = {};
    if (category === "new-arrivals" || category === "new") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filter.createdAt = { $gte: weekAgo };
    } else if (category) {
      filter.categories = category; // MongoDB matches if the array contains this value
    }
    if (search) {
      filter.$text = { $search: search };
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
    const total = visibleProducts.length;
    const paginatedProducts = visibleProducts.slice(skip, skip + limit);
    const productsWithAvailability = paginatedProducts.map((product) => ({
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

    return NextResponse.json({
      products: productsWithAvailability,
      total,
      page,
      totalPages: Math.ceil(total / limit),
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
