import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { getSession, hashPassword, comparePassword } from "@/store/lib/auth";

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { currentPassword, newPassword } = await req.json();

    if (!newPassword) {
      return NextResponse.json({ error: "New password is required" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const user = await User.findById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isGoogleAccount = Boolean(user.googleId);
    if (!isGoogleAccount) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }

      const valid = await comparePassword(currentPassword, user.password);
      if (!valid) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
