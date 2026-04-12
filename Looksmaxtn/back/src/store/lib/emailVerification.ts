import crypto from "crypto";

const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;

export function createEmailVerificationToken() {
  const token = crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

  return { token, tokenHash, expiresAt };
}

export function hashEmailVerificationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

  return { token, tokenHash, expiresAt };
}

export function hashPasswordResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
