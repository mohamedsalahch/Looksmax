import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import { canAccessAdminDashboard, comparePassword, createToken, getTokenCookieOptions } from "@/admin/lib/auth";
import { verifyTurnstileToken } from "@/store/lib/turnstile";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    let body: { email?: string; password?: string; turnstileToken?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 });

    const turnstile = await verifyTurnstileToken(req, body.turnstileToken, "admin_login");
    if (!turnstile.ok) {
      return NextResponse.json({ error: turnstile.error }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    if (!canAccessAdminDashboard(user.role)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

    const token = await createToken({ userId: user._id.toString(), role: user.role });
    const cookieOpts = getTokenCookieOptions();
    const res = NextResponse.json({
      token,
      user: { id: user._id, name: user.name, storeName: user.storeName || "", email: user.email, role: user.role },
    });
    res.cookies.set(cookieOpts.name, token, cookieOpts);
    return res;
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
