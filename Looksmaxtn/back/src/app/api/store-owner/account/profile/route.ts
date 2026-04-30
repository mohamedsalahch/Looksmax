import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import StoreAccount from "@/store-owner/models/StoreAccount";
import { getStoreOwnerSession } from "@/store-owner/lib/auth";

function getStorePayload(store: {
  _id: unknown;
  storeName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  logo?: string;
  onboardingCompleted?: boolean;
  firstLoginAt?: Date | null;
}) {
  return {
    id: String(store._id),
    storeName: store.storeName,
    ownerName: store.ownerName,
    ownerEmail: store.ownerEmail,
    ownerPhone: store.ownerPhone,
    logo: store.logo || "",
    onboardingCompleted: Boolean(store.onboardingCompleted),
    firstLoginAt: store.firstLoginAt || null,
  };
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getStoreOwnerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const storeName = String(body?.storeName || "").trim();
    const ownerName = String(body?.ownerName || "").trim();
    const ownerPhone = String(body?.ownerPhone || "").trim();
    const logo = String(body?.logo || "").trim();

    if (!storeName || !ownerName || !ownerPhone) {
      return NextResponse.json({ error: "Store name, owner name, and phone are required." }, { status: 400 });
    }

    if (logo && !logo.startsWith("data:image/")) {
      return NextResponse.json({ error: "Logo must be an image." }, { status: 400 });
    }

    await dbConnect();
    const store = await StoreAccount.findByIdAndUpdate(
      session.storeId,
      { storeName, ownerName, ownerPhone, logo },
      { new: true }
    ).lean();

    if (!store) return NextResponse.json({ error: "Store not found." }, { status: 404 });

    return NextResponse.json({ store: getStorePayload(store) });
  } catch (error) {
    console.error("Store owner profile update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
