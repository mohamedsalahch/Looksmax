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

export function getEmailAssetUrl(assetPath: string) {
  const baseUrl = getEmailBaseUrl();
  const cleanPath = String(assetPath || "").trim().replace(/^\/+/, "");
  if (!baseUrl || !cleanPath) return "";
  return `${baseUrl}/${cleanPath}`;
}
