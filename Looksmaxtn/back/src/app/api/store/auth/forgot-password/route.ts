import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { createPasswordResetToken } from "@/store/lib/emailVerification";
import { sendPasswordResetEmail } from "@/store/lib/mailer";
import { getEmailBaseUrl } from "@/store/lib/emailLinks";

const RESET_COOLDOWN_MS = 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({
        message: "If an account exists for this email, a reset link will be sent.",
      });
    }

    const lastSentAt = user.passwordResetSentAt ? new Date(user.passwordResetSentAt).getTime() : 0;
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
    const resetUrl = new URL("/reset-password", getEmailBaseUrl());
    resetUrl.searchParams.set("email", user.email);
    resetUrl.searchParams.set("token", reset.token);

    user.passwordResetTokenHash = reset.tokenHash;
    user.passwordResetExpiresAt = reset.expiresAt;
    user.passwordResetSentAt = new Date();
    await user.save();

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl: resetUrl.toString(),
    });

    return NextResponse.json({
      message: "Password reset email sent.",
      resendAvailableAfterSeconds: 60,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
