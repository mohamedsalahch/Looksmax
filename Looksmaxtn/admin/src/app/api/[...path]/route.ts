import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getBackendBaseUrl(req: NextRequest) {
  const localHostnames = new Set(["localhost", "127.0.0.1"]);

  if (localHostnames.has(req.nextUrl.hostname)) {
    return "http://127.0.0.1:3002";
  }

  return (
    process.env.BACKEND_PROXY_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://back:3002"
  ).replace(/\/$/, "");
}

function buildTargetUrl(req: NextRequest, path: string[]) {
  const target = new URL(`${getBackendBaseUrl(req)}/api/admin/${path.join("/")}`);
  target.search = req.nextUrl.search;
  return target;
}

function buildHeaders(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

async function proxy(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const method = req.method;
  const body = !["GET", "HEAD"].includes(method) ? new Uint8Array(await req.arrayBuffer()) : undefined;
  const requestInit: RequestInit = {
    method,
    headers: buildHeaders(req),
    body,
    redirect: "manual",
  };

  const response = await fetch(buildTargetUrl(req, path), requestInit);

  const nextResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
  });

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      nextResponse.headers.set(key, value);
    }
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    nextResponse.headers.set("set-cookie", setCookie);
  }

  return nextResponse;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
