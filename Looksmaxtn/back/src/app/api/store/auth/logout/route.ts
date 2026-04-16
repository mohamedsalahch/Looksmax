import { NextResponse } from "next/server";
import { getTokenCookieOptions } from "@/store/lib/auth";

export async function POST() {
  const res = NextResponse.json({ success: true });
  const cookieOpts = getTokenCookieOptions();
  res.cookies.delete(cookieOpts.name);
  res.cookies.set(cookieOpts.name, "", { ...cookieOpts, maxAge: 0 });
  return res;
}
