const AUTH_TOKEN_STORAGE_KEY = "looksmax-admin-token";

export function getStoredAuthToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function storeAuthToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function getTokenExpiryMs(token: string) {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(window.atob(padded)) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function refreshAdminAuthToken() {
  const response = await fetch("/api/admin/auth/refresh", withAuthRequest({ method: "POST" }));
  if (!response.ok) return null;

  const data = (await response.json()) as { token?: string | null };
  if (data.token) {
    storeAuthToken(data.token);
    return data.token;
  }

  return null;
}

export function withAuthHeaders(headers?: HeadersInit) {
  const token = getStoredAuthToken();
  if (!token) return headers;

  const nextHeaders = new Headers(headers);
  nextHeaders.set("Authorization", `Bearer ${token}`);
  return nextHeaders;
}

export function withAuthRequest(init: RequestInit = {}) {
  return {
    ...init,
    credentials: "include" as const,
    headers: withAuthHeaders(init.headers),
  };
}
