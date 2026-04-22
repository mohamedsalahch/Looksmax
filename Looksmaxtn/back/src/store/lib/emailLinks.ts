function cleanUrl(value: string | undefined, fallback = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\/$/, "");
}

export function getEmailBaseUrl() {
  return cleanUrl(
    process.env.EMAIL_BASE_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.ADMIN_BASE_URL ||
      "http://localhost:3000"
  );
}
