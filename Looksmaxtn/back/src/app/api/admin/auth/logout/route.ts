import { NextResponse } from "next/server";
import { getTokenCookieOptions } from "@/admin/lib/auth";

export async function POST() {
  const res = NextResponse.json({ success: true });
  const cookieOpts = getTokenCookieOptions();
  res.cookies.set(cookieOpts.name, "", { ...cookieOpts, maxAge: 0 });
  return res;
}
