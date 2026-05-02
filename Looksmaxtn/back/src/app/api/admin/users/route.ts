import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import { getSession } from "@/admin/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const users = await User.find().select("-password").sort({ createdAt: -1 }).lean();
    return NextResponse.json({ users });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();

    const { id, isBlocked, storeApprovalStatus } = await req.json();
    if (!id || (typeof isBlocked !== "boolean" && typeof storeApprovalStatus !== "string")) {
      return NextResponse.json({ error: "ID and an update value are required." }, { status: 400 });
    }

    const user = await User.findById(id);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (user.role === "admin") {
      return NextResponse.json({ error: "Admin accounts cannot be blocked here." }, { status: 400 });
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
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    await User.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
