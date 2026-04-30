import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import StoreAccount from "@/store-owner/models/StoreAccount";
import { getStoreOwnerSession } from "@/store-owner/lib/auth";

export async function GET() {
  try {
    const session = await getStoreOwnerSession();
    if (!session) {
      return NextResponse.json({ store: null }, { status: 401 });
    }

    await dbConnect();
    const store = await StoreAccount.findById(session.storeId).lean();
    if (!store) {
      return NextResponse.json({ store: null }, { status: 401 });
    }

    return NextResponse.json({
      store: {
        id: String(store._id),
        storeName: store.storeName,
        ownerName: store.ownerName,
        ownerEmail: store.ownerEmail,
        ownerPhone: store.ownerPhone,
        logo: store.logo || "",
        onboardingCompleted: Boolean(store.onboardingCompleted),
        firstLoginAt: store.firstLoginAt || null,
      },
    });
  } catch (error) {
    console.error("Store owner me error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
