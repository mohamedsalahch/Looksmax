import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import StoreAccount from "@/store-owner/models/StoreAccount";
import { hashPassword } from "@/store-owner/lib/auth";
import { hashPasswordResetToken } from "@/store/lib/emailVerification";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");

    if (!email || !token || !password) {
      return NextResponse.json({ error: "Email, token, and password are required." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const store = await StoreAccount.findOne({ ownerEmail: email });
    if (!store) {
      return NextResponse.json({ error: "Invalid reset link." }, { status: 400 });
    }

    if (!store.passwordResetTokenHash || !store.passwordResetExpiresAt) {
      return NextResponse.json({ error: "Reset link is no longer valid." }, { status: 410 });
    }

    if (store.passwordResetExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Reset link has expired." }, { status: 410 });
    }

    const tokenHash = hashPasswordResetToken(token);
    if (tokenHash !== store.passwordResetTokenHash) {
      return NextResponse.json({ error: "Invalid reset link." }, { status: 400 });
    }

    store.password = await hashPassword(password);
    store.passwordResetTokenHash = null;
    store.passwordResetExpiresAt = null;
    store.passwordResetSentAt = null;
    await store.save();

    return NextResponse.json({ message: "Store password updated successfully." });
  } catch (error) {
    console.error("Store owner reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
