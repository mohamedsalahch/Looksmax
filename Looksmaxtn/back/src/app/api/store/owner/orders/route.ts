import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import { getSession } from "@/store/lib/auth";
import Store from "@/store/models/Store";
import Order from "@/store/models/Order";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const requestedStoreId = searchParams.get("storeId");
    const storeFilter: Record<string, unknown> = { owner: session.userId };
    if (requestedStoreId && mongoose.Types.ObjectId.isValid(requestedStoreId)) {
      storeFilter._id = requestedStoreId;
    }

    const stores = await Store.find(storeFilter).select("_id").lean();
    const storeIds = stores.map((store) => store._id);
    if (storeIds.length === 0) return NextResponse.json({ orders: [] });

    const orders = await Order.find({ storeIds: { $in: storeIds } })
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Get owner orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
