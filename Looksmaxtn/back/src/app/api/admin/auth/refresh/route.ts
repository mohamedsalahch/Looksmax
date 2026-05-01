import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import { canAccessAdminDashboard, createToken, getSession, getTokenCookieOptions } from "@/admin/lib/auth";

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findById(session.userId).select("name storeName storeType email role").lean();
    if (!user || !canAccessAdminDashboard(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = await createToken({ userId: session.userId, role: user.role });
    const cookieOpts = getTokenCookieOptions();
    const res = NextResponse.json({
      token,
      user: { id: user._id, name: user.name, storeName: user.storeName || "", storeType: user.storeType || null, email: user.email, role: user.role },
    });
    res.cookies.set(cookieOpts.name, token, cookieOpts);
    return res;
  } catch (error) {
    console.error("Admin refresh error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
