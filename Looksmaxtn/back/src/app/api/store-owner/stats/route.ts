import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Order from "@/admin/models/Order";
import Product from "@/admin/models/Product";
import StoreAccount from "@/store-owner/models/StoreAccount";
import { getStoreOwnerSession } from "@/store-owner/lib/auth";

export async function GET() {
  try {
    const session = await getStoreOwnerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const store = await StoreAccount.findById(session.storeId).lean();
    if (!store) return NextResponse.json({ error: "Store not found." }, { status: 404 });

    const [products, orders] = await Promise.all([
      Product.find({ storeId: session.storeId }).select("stock fullStock isActive productType sizeStock").lean(),
      Order.find().sort({ createdAt: -1 }).select("totalPrice orderStatus createdAt items").lean(),
    ]);

    const productIds = new Set(products.map((product) => product._id.toString()));
    const storeOrders = orders.filter((order) =>
      (order.items || []).some((item) => productIds.has(String(item.product)))
    );

    const totalProducts = products.length;
    const activeProducts = products.filter((product) => product.isActive !== false).length;
    const totalOrders = storeOrders.length;
    const totalRevenue = storeOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
    const pendingOrders = storeOrders.filter((order) =>
      order.orderStatus === "processing" || order.orderStatus === "confirmed"
    ).length;
    const fulfilledOrders = storeOrders.filter((order) => order.orderStatus === "delivered").length;
    const lowStockProducts = products.filter((product) => {
      const sizeStock = product.sizeStock as Map<string, { stock?: number }> | undefined;
      const stock = sizeStock instanceof Map && sizeStock.size > 0
        ? Array.from(sizeStock.values()).reduce((sum, entry) => sum + Math.max(entry.stock ?? 0, 0), 0)
        : Math.max(product.stock ?? 0, 0);

      return stock > 0 && stock <= 3;
    }).length;
    const outOfStockProducts = products.filter((product) => {
      const sizeStock = product.sizeStock as Map<string, { stock?: number }> | undefined;
      const stock = sizeStock instanceof Map && sizeStock.size > 0
        ? Array.from(sizeStock.values()).reduce((sum, entry) => sum + Math.max(entry.stock ?? 0, 0), 0)
        : Math.max(product.stock ?? 0, 0);

      return stock <= 0;
    }).length;

    return NextResponse.json({
      totalProducts,
      activeProducts,
      totalOrders,
      pendingOrders,
      fulfilledOrders,
      totalRevenue,
      lowStockProducts,
      outOfStockProducts,
      recentOrders: storeOrders.slice(0, 5),
      latestOrderAt: storeOrders[0]?.createdAt || null,
      latestOrderId: storeOrders[0]?._id?.toString?.() || null,
    });
  } catch (error) {
    console.error("Store owner stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
