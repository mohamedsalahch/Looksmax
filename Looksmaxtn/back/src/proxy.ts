import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getRequiredJwtSecret } from "@/lib/env";

const COOKIE_NAME = "looksmax-admin-token";

type RateLimitRule = {
  name: string;
  max: number;
  windowMs: number;
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://192.168.1.127:3000",
  "http://192.168.1.127:3001",
  "https://looksmaxtn.com",
  "https://www.looksmaxtn.com",
  "https://store.looksmaxtn.com",
];

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

async function getAdminTokenRole(token: string) {
  try {
    const { payload } = await jwtVerify(token, getRequiredJwtSecret());
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function toOrigin(value?: string | null) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getAllowedOrigins() {
  const configured = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((entry) => toOrigin(entry.trim()))
    .filter(Boolean);

  const envOrigins = [
    process.env.FRONTEND_BASE_URL,
    process.env.ADMIN_BASE_URL,
    process.env.NEXT_PUBLIC_FRONT_URL,
    process.env.NEXT_PUBLIC_BACKEND_URL,
  ]
    .map(toOrigin)
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured, ...envOrigins]);
}

function getCorsOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  return getAllowedOrigins().has(origin) ? origin : "";
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "";
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown";
}

function getRateLimitRule(pathname: string, method: string): RateLimitRule | null {
  if (method !== "POST") return null;

  if (
    pathname.endsWith("/auth/login") ||
    pathname.endsWith("/auth/signup") ||
    pathname.endsWith("/auth/forgot-password") ||
    pathname.endsWith("/auth/reset-password") ||
    pathname.endsWith("/auth/resend-verification")
  ) {
    return { name: "auth", max: 10, windowMs: 15 * 60 * 1000 };
  }

  if (pathname.includes("/webhook")) {
    return { name: "webhook", max: 120, windowMs: 60 * 1000 };
  }

  if (pathname === "/api/store/orders") {
    return { name: "checkout", max: 20, windowMs: 10 * 60 * 1000 };
  }

  if (
    pathname.includes("/generate-outfit") ||
    pathname.includes("/generated-images") ||
    pathname.includes("/products/generate") ||
    pathname.includes("/products/enhance") ||
    pathname.includes("/body-profile/photo") ||
    pathname.includes("/body-profile/enhance") ||
    pathname.startsWith("/api/admin/homepage") ||
    pathname.startsWith("/api/admin/models")
  ) {
    return { name: "media-generation", max: 60, windowMs: 60 * 60 * 1000 };
  }

  return null;
}

function checkRateLimit(request: NextRequest, pathname: string) {
  const rule = getRateLimitRule(pathname, request.method);
  if (!rule) return null;

  const now = Date.now();
  const key = `${rule.name}:${getClientIp(request)}`;
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= rule.max) return null;

  const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

function publicDocsAllowed() {
  return process.env.ENABLE_PUBLIC_DOCS === "true" || process.env.NODE_ENV !== "production";
}

function canAccessAdminPath(role: string | null, pathname: string) {
  if (role === "admin") return true;
  if (role !== "store_owner") return false;

  return (
    pathname === "/api/admin/auth/me" ||
    pathname === "/api/admin/auth/refresh" ||
    pathname === "/api/admin/auth/logout" ||
    pathname === "/api/admin/jobs/events" ||
    pathname === "/api/admin/users/me/store" ||
    pathname === "/api/admin/users/me/balance" ||
    pathname === "/api/admin/users/me/withdrawals" ||
    pathname === "/api/admin/stats" ||
    pathname.startsWith("/api/admin/products") ||
    pathname.startsWith("/api/admin/orders") ||
    pathname.startsWith("/api/admin/categories") ||
    pathname.startsWith("/api/admin/models") ||
    pathname.startsWith("/api/admin/generated-images")
  );
}

function getBearerToken(authorizationHeader?: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function isPublicAdminPath(pathname: string) {
  return (
    pathname === "/api/admin/auth/login" ||
    pathname === "/api/admin/auth/forgot-password" ||
    pathname === "/api/admin/auth/reset-password" ||
    pathname === "/api/admin/turnstile-config" ||
    pathname === "/api/admin/notifications/webhook"
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if ((pathname === "/docs" || pathname.startsWith("/docs/") || pathname === "/api/openapi") && !publicDocsAllowed()) {
    return withResponseHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }), null);
  }

  if (!pathname.startsWith("/api")) {
    return withResponseHeaders(NextResponse.next(), null);
  }

  const origin = getCorsOrigin(request);
  if (origin === "") {
    return withResponseHeaders(
      NextResponse.json({ error: "Origin not allowed" }, { status: 403 }),
      null
    );
  }

  if (request.method === "OPTIONS") {
    return withResponseHeaders(new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "86400",
      },
    }), origin);
  }

  const rateLimitResponse = checkRateLimit(request, pathname);
  if (rateLimitResponse) return withResponseHeaders(rateLimitResponse, origin);

  if (
    pathname.startsWith("/api/admin") &&
    !isPublicAdminPath(pathname) &&
    pathname !== "/api/admin/generated-images/webhook" &&
    pathname !== "/api/admin/products/generate/webhook" &&
    pathname !== "/api/admin/products/enhance/webhook" &&
    pathname !== "/api/admin/products/enhance-shoes/webhook"
  ) {
    const token =
      getBearerToken(request.headers.get("authorization")) ||
      request.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
      return withResponseHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 403 }), origin);
    }

    const role = await getAdminTokenRole(token);
    if (!canAccessAdminPath(role, pathname)) {
      return withResponseHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 403 }), origin);
    }
  }

  return withResponseHeaders(NextResponse.next(), origin);
}

function withResponseHeaders(res: NextResponse, origin: string | null) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Vary", "Origin");
  }
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
