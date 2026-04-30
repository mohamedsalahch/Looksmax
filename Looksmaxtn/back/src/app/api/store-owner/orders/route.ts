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
      Product.find({ storeId: session.storeId }).select("_id").lean(),
      Order.find().populate("user", "name email").sort({ createdAt: -1 }).lean(),
    ]);

    const productIds = new Set(products.map((product) => product._id.toString()));
    const storeOrders = orders.filter((order) =>
      (order.items || []).some((item) => productIds.has(String(item.product)))
    );

    return NextResponse.json({ orders: storeOrders });
  } catch (error) {
    console.error("Store owner orders list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
