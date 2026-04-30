import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import StoreAccount from "@/store-owner/models/StoreAccount";
import { createPasswordResetToken } from "@/store/lib/emailVerification";
import { getStoreOwnerEmailBaseUrl } from "@/store/lib/emailLinks";
import { sendStorePasswordResetEmail } from "@/store/lib/mailer";
import { verifyTurnstileToken } from "@/store/lib/turnstile";

const RESET_COOLDOWN_MS = 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const turnstile = await verifyTurnstileToken(req, body?.turnstileToken, "store_owner_forgot_password");
    if (!turnstile.ok) {
      return NextResponse.json({ error: turnstile.error }, { status: 400 });
    }

    await dbConnect();

    const store = await StoreAccount.findOne({ ownerEmail: email });
    if (!store) {
      return NextResponse.json({
        message: "If a store account exists for this email, a reset link will be sent.",
      });
    }

    const lastSentAt = store.passwordResetSentAt ? new Date(store.passwordResetSentAt).getTime() : 0;
    const now = Date.now();
    if (lastSentAt && now - lastSentAt < RESET_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESET_COOLDOWN_MS - (now - lastSentAt)) / 1000);
      return NextResponse.json(
        {
          error: `Please wait ${retryAfterSeconds} seconds before requesting another reset email.`,
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds) },
        }
      );
    }

    const reset = createPasswordResetToken();
    const resetUrl = new URL("/reset-password", getStoreOwnerEmailBaseUrl());
    resetUrl.searchParams.set("email", store.ownerEmail);
    resetUrl.searchParams.set("token", reset.token);

    store.passwordResetTokenHash = reset.tokenHash;
    store.passwordResetExpiresAt = reset.expiresAt;
    store.passwordResetSentAt = new Date();
    await store.save();

    await sendStorePasswordResetEmail({
      to: store.ownerEmail,
      ownerName: store.ownerName,
      storeName: store.storeName,
      resetUrl: resetUrl.toString(),
    });

    return NextResponse.json({
      message: "Store password reset email sent.",
      resendAvailableAfterSeconds: 60,
    });
  } catch (error) {
    console.error("Store owner forgot password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
