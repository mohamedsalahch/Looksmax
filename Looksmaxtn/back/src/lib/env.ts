const UNSAFE_SECRET_MARKERS = [
  "change-me",
  "change-in-production",
  "looksmax-secret-key-change-in-production",
  "looksmax-production-shared-secret-change-me",
  "looksmax-production-webhook-secret-change-me",
];

export function getRequiredSecret(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  if (
    process.env.NODE_ENV === "production" &&
    UNSAFE_SECRET_MARKERS.some((marker) => value.toLowerCase().includes(marker))
  ) {
    throw new Error(`${name} must be rotated before production`);
  }

  return value;
}

export function getRequiredJwtSecret() {
  return new TextEncoder().encode(getRequiredSecret("JWT_SECRET"));
}
