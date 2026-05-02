import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import Order from "@/admin/models/Order";
import { getSession } from "@/admin/lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    await dbConnect();

    const user = await User.findById(id).select("-password").lean();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const orders = await Order.find({ user: id })
      .sort({ createdAt: -1 })
      .select("shippingAddress totalPrice orderStatus createdAt items")
      .lean();

    return NextResponse.json({ user, orders });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const { isBlocked, storeApprovalStatus } = await req.json();

    if (typeof isBlocked !== "boolean" && typeof storeApprovalStatus !== "string") {
      return NextResponse.json({ error: "An update value is required" }, { status: 400 });
    }

    await dbConnect();

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.role === "admin") {
      return NextResponse.json({ error: "Admin accounts cannot be blocked." }, { status: 400 });
    }

    if (typeof isBlocked === "boolean") {
      user.isBlocked = isBlocked;
    }
    if (typeof storeApprovalStatus === "string" && user.role === "store_owner") {
      if (!["pending", "approved", "rejected"].includes(storeApprovalStatus)) {
        return NextResponse.json({ error: "Invalid store approval status." }, { status: 400 });
      }
      user.storeApprovalStatus = storeApprovalStatus as "pending" | "approved" | "rejected";
    }
    await user.save();

    return NextResponse.json({ user });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
