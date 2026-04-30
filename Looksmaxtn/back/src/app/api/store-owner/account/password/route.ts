import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import StoreAccount from "@/store-owner/models/StoreAccount";
import { comparePassword, getStoreOwnerSession, hashPassword } from "@/store-owner/lib/auth";

export async function PUT(req: NextRequest) {
  try {
    const session = await getStoreOwnerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const currentPassword = String(body?.currentPassword || "");
    const newPassword = String(body?.newPassword || "");

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current password and new password are required." }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters." }, { status: 400 });
    }

    await dbConnect();
    const store = await StoreAccount.findById(session.storeId).select("password");
    if (!store) return NextResponse.json({ error: "Store not found." }, { status: 404 });

    const valid = await comparePassword(currentPassword, store.password);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    store.password = await hashPassword(newPassword);
    await store.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Store owner password update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
