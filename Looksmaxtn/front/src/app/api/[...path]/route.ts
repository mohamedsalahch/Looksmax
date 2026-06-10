import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getBackendBaseUrl() {
  return (
    process.env.BACKEND_PROXY_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    (process.env.NODE_ENV === "production" ? "http://back:3002" : "http://127.0.0.1:3002")
  ).replace(/\/$/, "");
}

function buildTargetUrl(req: NextRequest, path: string[]) {
  const target = new URL(`${getBackendBaseUrl()}/api/store/${path.join("/")}`);
  target.search = req.nextUrl.search;
  return target;
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

  return headers;
}

function parseSetCookieHeader(rawSetCookie: string) {
  const [nameValue, ...attributes] = rawSetCookie.split(";").map((part) => part.trim());
  const [name, ...valueParts] = nameValue.split("=");
  const value = valueParts.join("=");

  if (!name) return null;

  const cookieOptions: {
    path?: string;
    maxAge?: number;
    sameSite?: "lax" | "strict" | "none";
    secure?: boolean;
    httpOnly?: boolean;
  } = {};

  for (const attribute of attributes) {
    const [rawKey, ...rawValueParts] = attribute.split("=");
    const key = rawKey.toLowerCase();
    const rawValue = rawValueParts.join("=");

    if (key === "path") cookieOptions.path = rawValue || "/";
    else if (key === "max-age") cookieOptions.maxAge = Number(rawValue);
    else if (key === "samesite") {
      const normalized = rawValue.toLowerCase();
      if (normalized === "lax" || normalized === "strict" || normalized === "none") {
        cookieOptions.sameSite = normalized;
      }
    } else if (key === "secure") {
      cookieOptions.secure = true;
    } else if (key === "httponly") {
      cookieOptions.httpOnly = true;
    }
  }

  return { name, value, cookieOptions };
}

function applySetCookieHeader(source: Response, destination: NextResponse) {
  const headers = source.headers as Headers & { getSetCookie?: () => string[] };
  const rawSetCookies = headers.getSetCookie?.() ?? [];

  if (rawSetCookies.length > 0) {
    for (const rawSetCookie of rawSetCookies) {
      const parsed = parseSetCookieHeader(rawSetCookie);
      if (!parsed) continue;
      destination.cookies.set(parsed.name, parsed.value, parsed.cookieOptions);
    }
    return;
  }

  const rawSetCookie = source.headers.get("set-cookie");
  if (!rawSetCookie) return;

  const parsed = parseSetCookieHeader(rawSetCookie);
  if (!parsed) return;

  destination.cookies.set(parsed.name, parsed.value, parsed.cookieOptions);
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

  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const affectsCatalog = path[0] === "products" || path[0] === "categories";
  if (isMutation && affectsCatalog && response.status < 400) {
    revalidatePath("/category/all");
    revalidatePath("/category/[slug]", "page");
    revalidatePath("/", "page");
  }

  const nextResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
  });

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      nextResponse.headers.set(key, value);
    }
  });
  applySetCookieHeader(response, nextResponse);

  return nextResponse;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
