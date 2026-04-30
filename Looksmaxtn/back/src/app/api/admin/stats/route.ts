import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import Order from "@/admin/models/Order";
import User from "@/admin/models/User";
import StoreRequest from "@/admin/models/StoreRequest";
import { getSession } from "@/admin/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const [totalProducts, totalOrders, totalUsers, totalStores, orders] = await Promise.all([
      Product.countDocuments(),
      Order.countDocuments(),
      User.countDocuments(),
      StoreRequest.countDocuments(),
      Order.find().sort({ createdAt: -1 }).select("totalPrice orderStatus createdAt").lean(),
    ]);

    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const pendingOrders = orders.filter((o) => o.orderStatus === "processing" || o.orderStatus === "confirmed").length;
    const recentOrders = orders.slice(0, 5);
    const latestOrderAt = recentOrders[0]?.createdAt || null;
    const latestOrderId = recentOrders[0]?._id?.toString?.() || null;

    return NextResponse.json({ totalProducts, totalOrders, totalUsers, totalStores, totalRevenue, pendingOrders, recentOrders, latestOrderAt, latestOrderId });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
