"use client";

export type JobKind = "enhance" | "generate";
export type JobStatus = "processing" | "completed" | "failed";

export type JobUpdate = {
  kind: JobKind;
  jobId: string;
  status: JobStatus;
  images?: Record<string, string>;
  error?: string;
};

type Listener = (update: JobUpdate) => void;

const listeners = new Map<string, Listener>();
let source: EventSource | null = null;
let refCount = 0;

function ensureSource() {
  if (source) return;
  source = new EventSource("/api/jobs/events");
  source.onmessage = (event) => {
    let payload: unknown;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      (payload as { type?: string }).type !== "job:update"
    ) {
      return;
    }
    const update = payload as JobUpdate & { type: "job:update" };
    const listener = listeners.get(update.jobId);
    if (!listener) return;
    listener(update);
    if (update.status === "completed" || update.status === "failed") {
      listeners.delete(update.jobId);
    }
  };
  source.onerror = () => {
    // EventSource auto-reconnects; nothing to do here.
  };
}

function teardownIfIdle() {
  if (refCount > 0 || listeners.size > 0) return;
  if (source) {
    source.close();
    source = null;
  }
}

export function subscribeToJob(jobId: string, listener: Listener): () => void {
  if (!jobId) return () => {};
  refCount += 1;
  ensureSource();
  listeners.set(jobId, listener);
  return () => {
    if (listeners.get(jobId) === listener) {
      listeners.delete(jobId);
    }
    refCount = Math.max(0, refCount - 1);
    teardownIfIdle();
  };
}
