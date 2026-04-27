import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Order from "@/admin/models/Order";
import { getSession } from "@/admin/lib/auth";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");
    const filter: Record<string, unknown> = {};
    if (storeId && mongoose.Types.ObjectId.isValid(storeId)) {
      filter.storeIds = storeId;
    }

    const orders = await Order.find(filter)
      .populate("user", "name email")
      .populate("storeIds", "name slug logo category status isMainStore")
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ orders });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
