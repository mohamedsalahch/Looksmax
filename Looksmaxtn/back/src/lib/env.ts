let cachedJwtSecret: Uint8Array | null = null;

export function getRequiredJwtSecret(): Uint8Array {
  if (cachedJwtSecret) return cachedJwtSecret;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  cachedJwtSecret = new TextEncoder().encode(secret);
  return cachedJwtSecret;
}
