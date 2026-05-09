import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import Order from "@/admin/models/Order";
import User from "@/admin/models/User";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "stats")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    let productFilter: Record<string, unknown> = {};
    let orderFilter: Record<string, unknown> = {};
    let storeName = "";
    let storeSlug = "";
    let ownerProductIdSet: Set<string> | null = null;

    if (session.role === "store_owner") {
      productFilter = { "createdBy.id": session.userId };
      const productIds = await Product.find(productFilter).distinct("_id");
      ownerProductIdSet = new Set(productIds.map((productId) => productId.toString()));
      orderFilter = productIds.length > 0 ? { "items.product": { $in: productIds } } : { _id: { $in: [] } };
      const currentUser = await User.findById(session.userId).select("storeName storeSlug").lean();
      storeName = currentUser?.storeName || "";
      storeSlug = currentUser?.storeSlug || "";
    }

    const [totalProducts, totalOrders, totalUsers, orders] = await Promise.all([
      Product.countDocuments(productFilter),
      Order.countDocuments(orderFilter),
      session.role === "admin" ? User.countDocuments() : Promise.resolve(0),
      Order.find(orderFilter).sort({ createdAt: -1 }).select("totalPrice orderStatus createdAt items").lean(),
    ]);

    const totalRevenue = ownerProductIdSet
      ? orders.reduce((sum, order) => {
          const storeItemsTotal = (order.items || []).reduce((itemSum, item) => {
            const productId = item.product?.toString?.() || "";
            if (!ownerProductIdSet?.has(productId)) return itemSum;
            return itemSum + (item.price || 0) * (item.quantity || 0);
          }, 0);
          return sum + storeItemsTotal;
        }, 0)
      : orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const pendingOrders = orders.filter((o) => o.orderStatus === "processing" || o.orderStatus === "confirmed").length;
    const recentOrders = orders.slice(0, 5);
    const latestOrderAt = recentOrders[0]?.createdAt || null;
    const latestOrderId = recentOrders[0]?._id?.toString?.() || null;

    return NextResponse.json({
      totalProducts,
      totalOrders,
      totalUsers,
      totalRevenue,
      pendingOrders,
      recentOrders,
      latestOrderAt,
      latestOrderId,
      scope: session.role === "store_owner" ? "store" : "admin",
      storeName,
      storeSlug,
    });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
