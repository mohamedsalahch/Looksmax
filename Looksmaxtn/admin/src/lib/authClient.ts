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
