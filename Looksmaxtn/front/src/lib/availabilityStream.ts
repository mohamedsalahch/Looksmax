"use client";

type ChangeEvent = { productId: string; cartCount: number };
type Listener = (event: ChangeEvent) => void;

// One EventSource for the whole tab, shared across all ProductCard instances.
const listeners = new Set<Listener>();
let source: EventSource | null = null;

function connect() {
  if (source || typeof window === "undefined") return;

  source = new EventSource("/api/products/events");

  source.onmessage = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data) as ChangeEvent;
      listeners.forEach((l) => l(data));
    } catch {}
  };

  source.onerror = () => {
    // CLOSED means the browser won't auto-reconnect — clear our reference
    // so the next subscribe call creates a fresh connection.
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
    }
    // CONNECTING means EventSource is already trying to reconnect — do nothing.
  };
}

function disconnect() {
  source?.close();
  source = null;
}

export function subscribeToAvailabilityStream(fn: Listener): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(fn);
  connect();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) disconnect();
  };
}
