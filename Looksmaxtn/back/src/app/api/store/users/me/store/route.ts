import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";

const VALID_STORE_TYPES = new Set(["thrift", "retail"] as const);

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const body = await req.json().catch(() => null);
    const storeName = String(body?.storeName || "").trim();
    const storeType = String(body?.storeType || "").trim();

    if (!storeName) {
      return NextResponse.json({ error: "Store name is required" }, { status: 400 });
    }

    if (!VALID_STORE_TYPES.has(storeType as "thrift" | "retail")) {
      return NextResponse.json({ error: "Select a valid store type" }, { status: 400 });
    }

    const user = await User.findById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.role !== "store_owner") {
      return NextResponse.json({ error: "Only store owners can update store details" }, { status: 403 });
    }

    const changed = user.storeName !== storeName || user.storeType !== storeType;
    user.storeName = storeName;
    user.storeType = storeType as "thrift" | "retail";
    if (changed) {
      user.storeApprovalStatus = "pending";
      user.sessionVersion = (user.sessionVersion || 0) + 1;
    }
    await user.save();

    return NextResponse.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        storeName: user.storeName || "",
        storeType: user.storeType || null,
        storeApprovalStatus: user.storeApprovalStatus || null,
      },
      storeApprovalChanged: changed,
    });
  } catch (error) {
    console.error("Update store details error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
