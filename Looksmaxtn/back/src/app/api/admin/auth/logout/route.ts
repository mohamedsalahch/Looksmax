import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import { getSession, getTokenCookieOptions } from "@/admin/lib/auth";

export async function POST() {
  // Invalidate the session server-side: bumping sessionVersion makes every
  // outstanding JWT for this user fail validation, so a stale or undeleted
  // cookie can no longer reach the dashboard or mint refresh tokens.
  try {
    const session = await getSession();
    if (session?.userId) {
      await dbConnect();
      await User.updateOne({ _id: session.userId }, { $inc: { sessionVersion: 1 } });
    }
  } catch (error) {
    console.error("Logout session invalidation error:", error);
  }

  const res = NextResponse.json({ success: true });
  const cookieOpts = getTokenCookieOptions();
  res.cookies.delete(cookieOpts.name);
  res.cookies.set(cookieOpts.name, "", { ...cookieOpts, maxAge: 0 });
  return res;
}
