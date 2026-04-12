import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "looksmax-admin-token";
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "looksmax-secret-key-change-in-production"
);

async function verifyAdminToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload?.role === "admin";
  } catch {
    return false;
  }
}

function getBearerToken(authorizationHeader?: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
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
    pathname !== "/api/admin/auth/login" &&
    pathname !== "/api/admin/generated-images/webhook" &&
    pathname !== "/api/admin/products/generate/webhook"
  ) {
    const token =
      getBearerToken(request.headers.get("authorization")) ||
      request.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
      return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 403 }));
    }

    const isAdmin = await verifyAdminToken(token);
    if (!isAdmin) {
      return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 403 }));
    }
  }

  return addCorsHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
