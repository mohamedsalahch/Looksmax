"use client";

export type OutfitJobUpdate = {
  type: "outfit:update";
  jobId: string;
  status: "processing" | "completed" | "failed";
  images?: { front?: string; back?: string };
  errorMessage?: string;
};

export type BodyProfileUpdate = {
  type: "body-profile:update";
  status: "processing" | "completed" | "failed";
  enhancedImagePath?: string;
  errorMessage?: string;
};

type StoreUserEvent = OutfitJobUpdate | BodyProfileUpdate | { type: "connected" };

type OutfitListener = (update: OutfitJobUpdate) => void;
type BodyProfileListener = (update: BodyProfileUpdate) => void;

const outfitListeners = new Map<string, OutfitListener>();
const bodyProfileListeners = new Set<BodyProfileListener>();
let eventSource: EventSource | null = null;

function hasActiveListeners() {
  return outfitListeners.size > 0 || bodyProfileListeners.size > 0;
}

function ensureSource() {
  if (eventSource) return;
  const source = new EventSource("/api/events");
  eventSource = source;
  source.onmessage = (event) => {
    let payload: StoreUserEvent | null = null;
    try {
      payload = JSON.parse(event.data) as StoreUserEvent;
    } catch {
      return;
    }
    if (!payload) return;

    if (payload.type === "outfit:update") {
      const listener = outfitListeners.get(payload.jobId);
      if (listener) {
        listener(payload);
        if (payload.status === "completed" || payload.status === "failed") {
          outfitListeners.delete(payload.jobId);
        }
      }
    } else if (payload.type === "body-profile:update") {
      for (const listener of bodyProfileListeners) listener(payload);
    }
  };
  source.onerror = () => {
    // EventSource auto-reconnects; nothing to do here.
  };
}

function teardownIfIdle() {
  if (hasActiveListeners()) return;
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

export function subscribeToOutfitJob(jobId: string, listener: OutfitListener): () => void {
  if (!jobId) return () => {};
  outfitListeners.set(jobId, listener);
  ensureSource();
  return () => {
    if (outfitListeners.get(jobId) === listener) {
      outfitListeners.delete(jobId);
    }
    teardownIfIdle();
  };
}

export function subscribeToBodyProfile(listener: BodyProfileListener): () => void {
  bodyProfileListeners.add(listener);
  ensureSource();
  return () => {
    bodyProfileListeners.delete(listener);
    teardownIfIdle();
  };
}
