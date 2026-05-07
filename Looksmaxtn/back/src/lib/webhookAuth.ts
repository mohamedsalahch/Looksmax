import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRequiredSecret } from "@/lib/env";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireWebhookSecret(
  req: NextRequest,
  options: { allowQuerySecret?: boolean } = {}
) {
  let configuredSecret: string;
  try {
    configuredSecret = getRequiredSecret("OUTFIT_WEBHOOK_SECRET");
  } catch (error) {
    console.error("[webhook-auth] Missing or unsafe OUTFIT_WEBHOOK_SECRET:", error);
    return NextResponse.json(
      { error: "Webhook authentication is not configured" },
      { status: 503 }
    );
  }

  const requestSecret =
    req.headers.get("x-webhook-secret") ||
    (options.allowQuerySecret ? req.nextUrl.searchParams.get("secret") : "") ||
    "";

  if (!requestSecret || !safeEqual(requestSecret, configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
