import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// WhatsApp Business Cloud API webhook endpoint.
// GET  — Meta's one-time verification handshake when you save the callback URL.
// POST — delivery receipts for messages we send, plus any incoming messages.
// Meta retries non-200 responses for up to 7 days, so POST always acks fast.

function cleanEnvValue(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const verifyToken = cleanEnvValue(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

type WebhookStatus = {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};

type WebhookMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Optional payload authentication: set WHATSAPP_APP_SECRET (the Meta app
  // secret) to reject payloads that are not signed by Meta.
  const appSecret = cleanEnvValue(process.env.WHATSAPP_APP_SECRET);
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256") || "";
    const expected =
      "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const valid =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  try {
    const payload = JSON.parse(rawBody);
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change?.field !== "messages") continue;
        const value = change?.value || {};

        const statuses: WebhookStatus[] = Array.isArray(value.statuses) ? value.statuses : [];
        for (const status of statuses) {
          if (status.status === "failed" || status.status === "undelivered") {
            console.error(
              `[whatsapp] message ${status.id || "?"} to ${status.recipient_id || "?"} ${status.status}:`,
              JSON.stringify(status.errors || [])
            );
          }
        }

        const messages: WebhookMessage[] = Array.isArray(value.messages) ? value.messages : [];
        for (const message of messages) {
          // Incoming replies (also open a 24h free-form messaging window).
          console.log(
            `[whatsapp] incoming ${message.type || "message"} from ${message.from || "?"}:`,
            message.type === "text" ? String(message.text?.body || "") : message.id || ""
          );
        }
      }
    }
  } catch (error) {
    // Malformed payloads are acked anyway — never trigger Meta's retry storm.
    console.error("[whatsapp] webhook parse error:", error);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
