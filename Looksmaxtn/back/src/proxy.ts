import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "looksmax-admin-token";
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "looksmax-secret-key-change-in-production"
);

async function getAdminTokenRole(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function canAccessAdminPath(role: string | null, pathname: string) {
  if (role === "admin") return true;
  if (role !== "store_owner") return false;

  return (
    pathname === "/api/admin/auth/me" ||
    pathname === "/api/admin/auth/refresh" ||
    pathname === "/api/admin/auth/logout" ||
    pathname === "/api/admin/users/me/store" ||
    pathname === "/api/admin/users/me/store-credits" ||
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

  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin") || "*";

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const addCorsHeaders = (res: NextResponse) => {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    res.headers.set("Access-Control-Allow-Credentials", "true");
    return res;
  };

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
      return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 403 }));
    }

    const role = await getAdminTokenRole(token);
    if (!canAccessAdminPath(role, pathname)) {
      return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 403 }));
    }
  }

  return addCorsHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
