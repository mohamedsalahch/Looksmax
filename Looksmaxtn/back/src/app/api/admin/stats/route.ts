import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import Order from "@/admin/models/Order";
import User from "@/admin/models/User";
import { getSession } from "@/admin/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const [totalProducts, totalOrders, totalUsers, orders] = await Promise.all([
      Product.countDocuments(),
      Order.countDocuments(),
      User.countDocuments(),
      Order.find().select("totalPrice orderStatus createdAt").lean(),
    ]);

    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const pendingOrders = orders.filter((o) => o.orderStatus === "processing" || o.orderStatus === "confirmed").length;
    const recentOrders = orders.slice(0, 5);

    return NextResponse.json({ totalProducts, totalOrders, totalUsers, totalRevenue, pendingOrders, recentOrders });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
