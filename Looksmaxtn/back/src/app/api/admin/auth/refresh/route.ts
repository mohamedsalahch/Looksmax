import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import { createToken, getSession, getTokenCookieOptions } from "@/admin/lib/auth";

export async function POST() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      console.log("[auth][admin][refresh] unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findById(session.userId).select("name email role").lean();
    if (!user || user.role !== "admin") {
      console.log("[auth][admin][refresh] invalid user", {
        userId: session.userId,
        found: Boolean(user),
        role: user?.role,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = await createToken({ userId: session.userId, role: session.role });
    const cookieOpts = getTokenCookieOptions();
    const res = NextResponse.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
    res.cookies.set(cookieOpts.name, token, cookieOpts);
    console.log("[auth][admin][refresh] success", {
      userId: session.userId,
      secureCookie: cookieOpts.secure,
      maxAge: cookieOpts.maxAge,
    });
    return res;
  } catch (error) {
    console.error("Admin refresh error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
