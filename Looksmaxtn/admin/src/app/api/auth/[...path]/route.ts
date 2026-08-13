import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const COOKIE_NAME = "looksmax-admin-token";

function getBackendBaseUrl(req: NextRequest) {
  const localHostnames = new Set(["localhost", "127.0.0.1", "192.168.1.127"]);

  if (localHostnames.has(req.nextUrl.hostname)) {
    return "http://localhost:3002";
  }

  return (
    process.env.BACKEND_PROXY_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://back:3002"
  ).replace(/\/$/, "");
}

function buildHeaders(req: NextRequest) {
  const headers = new Headers(req.headers);

  for (const headerName of [
    "host",
    "connection",
    "content-length",
    "rsc",
    "next-action",
    "next-router-state-tree",
    "next-router-prefetch",
    "next-router-segment-prefetch",
    "next-url",
    "x-action-forwarded",
    "x-invoke-path",
    "x-invoke-query",
    "x-invoke-output",
    "x-invoke-status",
  ]) {
    headers.delete(headerName);
  }

  if (!headers.has("authorization")) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token) headers.set("authorization", `Bearer ${token}`);
  }

  return headers;
}

async function proxyAuth(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const method = req.method;
  const body = !["GET", "HEAD"].includes(method) ? new Uint8Array(await req.arrayBuffer()) : undefined;
  const target = new URL(`${getBackendBaseUrl(req)}/api/admin/auth/${path.join("/")}`);
  target.search = req.nextUrl.search;

  const response = await fetch(target, {
    method,
    headers: buildHeaders(req),
    body,
    redirect: "manual",
  });

  const nextResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
  });

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    nextResponse.headers.set(key, value);
  });
  // Set-Cookie must be appended per cookie — forEach would comma-join
  // multiple cookies into one invalid header.
  for (const cookie of response.headers.getSetCookie()) {
    nextResponse.headers.append("set-cookie", cookie);
  }

  return nextResponse;
}

export const GET = proxyAuth;
export const POST = proxyAuth;
export const PUT = proxyAuth;
export const PATCH = proxyAuth;
export const DELETE = proxyAuth;
export const OPTIONS = proxyAuth;
export const HEAD = proxyAuth;
