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

function canAccessAdminDashboard(role: string | null) {
  return role === "admin" || role === "store_owner";
}

function getBearerToken(authorizationHeader?: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token =
    getBearerToken(request.headers.get("authorization")) ||
    request.cookies.get(COOKIE_NAME)?.value;
  const role = token ? await getAdminTokenRole(token) : null;
  const isAuthenticated = canAccessAdminDashboard(role);

  if (pathname === "/") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/dashboard")) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*"],
};
