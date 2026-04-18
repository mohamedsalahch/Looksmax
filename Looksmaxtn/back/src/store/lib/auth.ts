import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { cookies, headers } from "next/headers";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "looksmax-secret-key-change-in-production"
);

const COOKIE_NAME = "looksmax-token";
const TOKEN_TTL_SECONDS = 60 * 30;

export interface JWTPayload {
  userId: string;
  role: string;
  sessionVersion?: number;
}

function getBearerTokenFromHeader(authorizationHeader?: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(
  password: string,
  hashed: string
): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}

export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JWTPayload | null> {
  const headersStore = await headers();
  const bearerToken = getBearerTokenFromHeader(headersStore.get("authorization"));
  if (bearerToken) {
    const payload = await verifyToken(bearerToken);
    if (!payload) return null;
    await dbConnect();
    const user = await User.collection.findOne(
      { _id: new mongoose.Types.ObjectId(payload.userId) },
      { projection: { isBlocked: 1, sessionVersion: 1 } }
    );
    if (!user || user.isBlocked) return null;
    const dbVersion = Number(user.sessionVersion ?? 0);
    if (payload.sessionVersion !== undefined && payload.sessionVersion !== dbVersion) return null;
    return payload;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  await dbConnect();
  const user = await User.collection.findOne(
    { _id: new mongoose.Types.ObjectId(payload.userId) },
    { projection: { isBlocked: 1, sessionVersion: 1 } }
  );
  if (!user || user.isBlocked) return null;
  const dbVersion = Number(user.sessionVersion ?? 0);
  if (payload.sessionVersion !== undefined && payload.sessionVersion !== dbVersion) return null;
  return payload;
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
