import { NextRequest, NextResponse } from "next/server";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";
import { requireWebhookSecret } from "@/lib/webhookAuth";

export async function POST(req: NextRequest) {
  try {
    const unauthorized = requireWebhookSecret(req);
    if (unauthorized) return unauthorized;

    const event = await req.json();
    if (!event || typeof event.type !== "string") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    broadcastAdminEvent(event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin-notifications-webhook] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
