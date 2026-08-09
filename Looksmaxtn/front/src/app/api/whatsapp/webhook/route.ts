import type { NextRequest } from "next/server";

// Public passthrough for the WhatsApp Business Cloud API webhook.
// Meta can only reach the front domain (looksmaxtn.com); the backend listens
// on the internal network, so this route forwards the webhook traffic to it.
// Signature validation happens in the backend route, which needs the raw
// body and the x-hub-signature-256 header forwarded untouched.

function getBackendBaseUrl() {
  return (
    process.env.BACKEND_PROXY_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    (process.env.NODE_ENV === "production" ? "http://back:3002" : "http://127.0.0.1:3002")
  ).replace(/\/$/, "");
}

function buildTargetUrl(req: NextRequest) {
  const target = new URL(`${getBackendBaseUrl()}/api/whatsapp/webhook`);
  target.search = req.nextUrl.search;
  return target;
}

export async function GET(req: NextRequest) {
  const response = await fetch(buildTargetUrl(req), { cache: "no-store" });
  return new Response(await response.text(), { status: response.status });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headers: Record<string, string> = {
    "content-type": req.headers.get("content-type") || "application/json",
  };
  const signature = req.headers.get("x-hub-signature-256");
  if (signature) headers["x-hub-signature-256"] = signature;

  const response = await fetch(buildTargetUrl(req), {
    method: "POST",
    headers,
    body: rawBody,
    cache: "no-store",
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}
