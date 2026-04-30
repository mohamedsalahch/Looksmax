import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import StoreAccount from "@/store-owner/models/StoreAccount";
import { getStoreOwnerSession } from "@/store-owner/lib/auth";

export async function PUT(req: NextRequest) {
  try {
    const session = await getStoreOwnerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const logo = String(body?.logo || "").trim();
    if (!logo || !logo.startsWith("data:image/")) {
      return NextResponse.json({ error: "Logo image is required." }, { status: 400 });
    }

    await dbConnect();
    const store = await StoreAccount.findByIdAndUpdate(
      session.storeId,
      { logo, onboardingCompleted: true },
      { new: true }
    ).lean();
    if (!store) return NextResponse.json({ error: "Store not found." }, { status: 404 });

    return NextResponse.json({ store });
  } catch (error) {
    console.error("Store logo onboarding error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
