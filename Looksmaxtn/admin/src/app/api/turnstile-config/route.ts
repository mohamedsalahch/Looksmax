import { NextResponse } from "next/server";

function isLocalUrl(value: string | undefined) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function GET() {
  const localTurnstileEnabled = process.env.NEXT_PUBLIC_TURNSTILE_ENABLE_LOCAL === "true";
  const localBackend = isLocalUrl(process.env.NEXT_PUBLIC_BACKEND_URL);
  const shouldExposeSiteKey = localTurnstileEnabled || (process.env.NODE_ENV === "production" && !localBackend);

  return NextResponse.json({
    siteKey: shouldExposeSiteKey
      ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || ""
      : "",
  });
}
