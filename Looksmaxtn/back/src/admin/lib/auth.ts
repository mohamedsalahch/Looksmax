import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { cookies, headers } from "next/headers";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import { getRequiredJwtSecret } from "@/lib/env";

const COOKIE_NAME = "looksmax-admin-token";
const TOKEN_TTL_SECONDS = 60 * 30;

export interface JWTPayload { userId: string; role: string; sessionVersion?: number; }

export function canAccessAdminDashboard(role?: string | null) {
  return role === "admin" || role === "store_owner";
}

export function canAccessAdminResource(
  role: string | undefined | null,
  resource: "products" | "orders" | "stats" | "assets" | "admin"
) {
  if (role === "admin") return true;
  return (
    role === "store_owner" &&
    (resource === "products" || resource === "orders" || resource === "stats" || resource === "assets")
  );
}

function getBearerTokenFromHeader(authorizationHeader?: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function hashPassword(password: string) { return bcrypt.hash(password, 12); }
export async function comparePassword(password: string, hashed: string) { return bcrypt.compare(password, hashed); }

export async function createToken(payload: JWTPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(getRequiredJwtSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getRequiredJwtSecret());
    return payload as unknown as JWTPayload;
  } catch { return null; }
}

export async function getSession(): Promise<JWTPayload | null> {
  const headersStore = await headers();
  const bearerToken = getBearerTokenFromHeader(headersStore.get("authorization"));
  const tokenFromHeader = bearerToken ? await verifyToken(bearerToken) : null;
  if (tokenFromHeader) {
    const validatedHeaderSession = await validateAdminSession(tokenFromHeader);
    if (validatedHeaderSession) return validatedHeaderSession;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return validateAdminSession(payload);
}

async function validateAdminSession(payload: JWTPayload): Promise<JWTPayload | null> {
  if (!mongoose.Types.ObjectId.isValid(payload.userId)) return null;

  await dbConnect();
  const user = await User.collection.findOne(
    { _id: new mongoose.Types.ObjectId(payload.userId) },
    { projection: { role: 1, isBlocked: 1, sessionVersion: 1 } }
  );

  if (!user || user.isBlocked || !canAccessAdminDashboard(user.role)) return null;

  const dbVersion = Number(user.sessionVersion ?? 0);
  if (payload.sessionVersion !== undefined && payload.sessionVersion !== dbVersion) return null;

  return {
    userId: payload.userId,
    role: String(user.role),
    sessionVersion: dbVersion,
  };
}

function shouldUseSecureCookies() {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function getTokenCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  };
}
