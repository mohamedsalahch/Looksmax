import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import StoreAccount from "@/store-owner/models/StoreAccount";
import { comparePassword, createStoreOwnerToken } from "@/store-owner/lib/auth";
import { verifyTurnstileToken } from "@/store/lib/turnstile";

function getStorePayload(store: {
  _id: { toString(): string };
  storeName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  logo?: string;
  onboardingCompleted?: boolean;
  firstLoginAt?: Date | null;
}) {
  return {
    id: store._id.toString(),
    storeName: store.storeName,
    ownerName: store.ownerName,
    ownerEmail: store.ownerEmail,
    ownerPhone: store.ownerPhone,
    logo: store.logo || "",
    onboardingCompleted: Boolean(store.onboardingCompleted),
    firstLoginAt: store.firstLoginAt || null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const turnstile = await verifyTurnstileToken(req, body?.turnstileToken, "store_owner_login");
    if (!turnstile.ok) {
      return NextResponse.json({ error: turnstile.error }, { status: 400 });
    }

    await dbConnect();
    const store = await StoreAccount.findOne({ ownerEmail: email });
    if (!store) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const valid = await comparePassword(password, store.password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (!store.firstLoginAt) {
      store.firstLoginAt = new Date();
      await store.save();
    }

    const token = await createStoreOwnerToken({ storeId: store._id.toString(), role: "store" });
    return NextResponse.json({ token, store: getStorePayload(store) });
  } catch (error) {
    console.error("Store owner login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
