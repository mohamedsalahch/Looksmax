import type { NextRequest } from "next/server";

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
  const hasBody = !["GET", "HEAD"].includes(method);

  const response = await fetch(buildTargetUrl(req, path), {
    method,
    headers: buildHeaders(req),
    body: hasBody ? req.body : undefined,
    duplex: hasBody ? "half" : undefined,
    redirect: "manual",
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
