"use client";

import { getReservationKey } from "@/lib/reservations";

export type AvailabilityEvent = {
  productId: string;
  cartCount: number;
  stock: number;
  sizeAvailability: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null;
  viewerBlocked: boolean;
};

type EventFn = (event: AvailabilityEvent) => void;
type ReconnectFn = () => void;

// One EventSource for the whole tab, shared across all consumers.
const listeners = new Set<EventFn>();
const reconnectListeners = new Set<ReconnectFn>();
let source: EventSource | null = null;
let connectedOnce = false;

function buildStreamUrl() {
  // Always ensure a stable guest key exists BEFORE opening the stream, so the
  // server registers this SSE client with the same key the reserve POSTs will use.
  // Without this, a first-time guest would open SSE with no rk, get registered as
  // reservationKey=null, and then see their own reservations as "reservedElsewhere".
  const rk = getReservationKey();
  return rk ? `/api/products/events?rk=${encodeURIComponent(rk)}` : "/api/products/events";
}

function connect() {
  if (source || typeof window === "undefined") return;

  source = new EventSource(buildStreamUrl());

  source.onopen = () => {
    if (connectedOnce) {
      // Fire all reconnect handlers so consumers can re-fetch user-specific data.
      reconnectListeners.forEach((fn) => fn());
    }
    connectedOnce = true;
  };

  source.onmessage = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data) as AvailabilityEvent;
      listeners.forEach((l) => l(data));
    } catch {}
  };

  source.onerror = () => {
    // CLOSED means the browser won't auto-reconnect — clear our reference
    // so the next subscribe call creates a fresh connection.
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
      connectedOnce = false;
    }
    // CONNECTING means EventSource is already trying to reconnect — do nothing.
  };
}

function disconnect() {
  source?.close();
  source = null;
  connectedOnce = false;
}

export function reconnectAvailabilityStream() {
  if (typeof window === "undefined") return;
  disconnect();
  if (listeners.size > 0) connect();
}

export function subscribeToAvailabilityStream(
  onEvent: EventFn,
  onReconnect?: ReconnectFn
): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(onEvent);
  if (onReconnect) reconnectListeners.add(onReconnect);
  connect();
  return () => {
    listeners.delete(onEvent);
    if (onReconnect) reconnectListeners.delete(onReconnect);
    if (listeners.size === 0) disconnect();
  };
}
