"use client";

const RESERVATION_KEY_STORAGE = "looksmax-reservation-key";
const RESERVATION_EVENT = "looksmax-reservation-change";

function emitReservationChange(productId: string, reservationExpiresAt: string | null, cartCount: number | null = null) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(RESERVATION_EVENT, {
      detail: { productId, reservationExpiresAt, cartCount },
    })
  );
}

function generateReservationKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `reservation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getReservationKey() {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(RESERVATION_KEY_STORAGE);
  if (existing) return existing;

  const next = generateReservationKey();
  window.localStorage.setItem(RESERVATION_KEY_STORAGE, next);
  return next;
}

export async function reserveProduct(productId: string, quantity = 1) {
  const reservationKey = getReservationKey();

  const response = await fetch(`/api/products/${productId}/reserve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reservationKey, quantity }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Unable to add this product to the cart right now.");
  }

  emitReservationChange(productId, data.reservationExpiresAt || null, data.cartCount ?? null);
  return data as { reservationExpiresAt: string; cartCount?: number };
}

export async function releaseProductReservation(productId: string) {
  const reservationKey = getReservationKey();

  const response = await fetch(`/api/products/${productId}/reserve`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reservationKey }),
  });

  const data = await response.json().catch(() => ({}));
  emitReservationChange(productId, null, typeof data.cartCount === "number" ? data.cartCount : null);
}

export function subscribeToReservationChanges(
  callback: (payload: { productId: string; reservationExpiresAt: string | null; cartCount?: number | null }) => void
) {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ productId: string; reservationExpiresAt: string | null; cartCount?: number | null }>;
    callback(customEvent.detail);
  };

  window.addEventListener(RESERVATION_EVENT, handler);
  return () => window.removeEventListener(RESERVATION_EVENT, handler);
}

export function formatRemainingTime(reservationExpiresAt?: string | null, nowMs = Date.now()) {
  if (!reservationExpiresAt) return null;

  const remainingMs = new Date(reservationExpiresAt).getTime() - nowMs;
  if (remainingMs <= 0) return null;

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
