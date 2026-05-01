import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Order from "@/admin/models/Order";
import Product from "@/admin/models/Product";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "orders")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    await dbConnect();
    const filter: Record<string, unknown> = {};
    let ownerProductIdSet: Set<string> | null = null;
    if (session.role === "store_owner") {
      const productIds = await Product.find({ "createdBy.id": session.userId }).distinct("_id");
      if (productIds.length === 0) return NextResponse.json({ orders: [] });
      ownerProductIdSet = new Set(productIds.map((productId) => productId.toString()));
      filter["items.product"] = { $in: productIds };
    }
    const orders = await Order.find(filter).populate("user", "name email").sort({ createdAt: -1 }).lean();
    return NextResponse.json({
      orders: ownerProductIdSet
        ? orders.map((order) => ({
            ...order,
            items: order.items.filter((item) => ownerProductIdSet.has(item.product.toString())),
          }))
        : orders,
    });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
