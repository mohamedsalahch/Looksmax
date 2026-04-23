"use client";

export type AvailabilityEvent = {
  productId: string;
  cartCount: number;
  stock: number;
  sizeAvailability: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null;
};

type EventFn = (event: AvailabilityEvent) => void;
type ReconnectFn = () => void;

// One EventSource for the whole tab, shared across all consumers.
const listeners = new Set<EventFn>();
const reconnectListeners = new Set<ReconnectFn>();
let source: EventSource | null = null;
let connectedOnce = false;

function connect() {
  if (source || typeof window === "undefined") return;

  source = new EventSource("/api/products/events");

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
