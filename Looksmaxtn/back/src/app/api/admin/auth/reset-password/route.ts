import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import { canAccessAdminDashboard, hashPassword } from "@/admin/lib/auth";
import { hashPasswordResetToken } from "@/store/lib/emailVerification";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");

    if (!email || !token || !password) {
      return NextResponse.json(
        { error: "Email, token, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const user = await User.findOne({ email });
    if (!user || !canAccessAdminDashboard(user.role)) {
      return NextResponse.json({ error: "Invalid reset link" }, { status: 400 });
    }

    if (!user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
      return NextResponse.json({ error: "Reset link is no longer valid" }, { status: 410 });
    }

    if (user.passwordResetExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Reset link has expired" }, { status: 410 });
    }

    const tokenHash = hashPasswordResetToken(token);
    if (tokenHash !== user.passwordResetTokenHash) {
      return NextResponse.json({ error: "Invalid reset link" }, { status: 400 });
    }

    user.password = await hashPassword(password);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.passwordResetSentAt = null;
    await user.save();

    return NextResponse.json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Admin reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
