import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "looksmax-secret-key-change-in-production"
);

export interface StoreOwnerJWTPayload {
  storeId: string;
  role: "store";
}

function getBearerTokenFromHeader(authorizationHeader?: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hashed: string) {
  return bcrypt.compare(password, hashed);
}

export async function createStoreOwnerToken(payload: StoreOwnerJWTPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(JWT_SECRET);
}

export async function verifyStoreOwnerToken(token: string): Promise<StoreOwnerJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.role !== "store" || typeof payload.storeId !== "string") return null;
    return payload as unknown as StoreOwnerJWTPayload;
  } catch {
    return null;
  }
}

export async function getStoreOwnerSession() {
  const headersStore = await headers();
  const bearerToken = getBearerTokenFromHeader(headersStore.get("authorization"));
  if (!bearerToken) return null;
  return verifyStoreOwnerToken(bearerToken);
}
