import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import StoreAccount from "@/store-owner/models/StoreAccount";
import { getStoreOwnerSession } from "@/store-owner/lib/auth";

export async function PUT(req: NextRequest) {
  try {
    const session = await getStoreOwnerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const storeName = String(body?.storeName || "").trim();
    if (!storeName) {
      return NextResponse.json({ error: "Store name is required." }, { status: 400 });
    }

    await dbConnect();
    const store = await StoreAccount.findByIdAndUpdate(
      session.storeId,
      { storeName },
      { new: true }
    ).lean();
    if (!store) return NextResponse.json({ error: "Store not found." }, { status: 404 });

    return NextResponse.json({ store });
  } catch (error) {
    console.error("Store name onboarding error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
