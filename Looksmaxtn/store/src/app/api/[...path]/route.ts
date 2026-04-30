import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getBackendBaseUrl(req: NextRequest) {
  if (req.nextUrl.hostname === "localhost" || req.nextUrl.hostname === "127.0.0.1") {
    return "http://127.0.0.1:3002";
  }

  return (
    process.env.BACKEND_PROXY_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://back:3002"
  ).replace(/\/$/, "");
}

function buildTargetUrl(req: NextRequest, path: string[]) {
  const target = new URL(`${getBackendBaseUrl(req)}/api/store-owner/${path.join("/")}`);
  target.search = req.nextUrl.search;
  return target;
}

function buildHeaders(req: NextRequest) {
  const headers = new Headers(req.headers);
  [
    "host",
    "connection",
    "content-length",
    "rsc",
    "next-action",
    "next-router-state-tree",
    "next-router-prefetch",
    "next-router-segment-prefetch",
    "next-url",
  ].forEach((headerName) => headers.delete(headerName));
  return headers;
}

async function proxy(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const method = req.method;
  const body = !["GET", "HEAD"].includes(method) ? new Uint8Array(await req.arrayBuffer()) : undefined;
  const response = await fetch(buildTargetUrl(req, path), {
    method,
    headers: buildHeaders(req),
    body,
    redirect: "manual",
  });

  const nextResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
  });
  response.headers.forEach((value, key) => nextResponse.headers.set(key, value));
  return nextResponse;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
