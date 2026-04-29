import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || "",
  });
}
