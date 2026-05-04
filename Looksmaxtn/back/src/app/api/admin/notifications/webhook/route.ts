import { NextRequest, NextResponse } from "next/server";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";

export async function POST(req: NextRequest) {
  try {
    const configuredSecret = process.env.OUTFIT_WEBHOOK_SECRET || "";
    const requestSecret = req.headers.get("x-webhook-secret") || "";

    if (configuredSecret && requestSecret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
