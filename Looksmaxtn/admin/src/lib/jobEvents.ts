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
let eventSource: EventSource | null = null;

function ensureSource() {
  if (eventSource) return;
  const source = new EventSource("/api/jobs/events");
  eventSource = source;
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
    if (listener) {
      listener(update);
      if (update.status === "completed" || update.status === "failed") {
        listeners.delete(update.jobId);
      }
    }
  };
  source.onerror = () => {
    // EventSource auto-reconnects; nothing to do here.
  };
}

function teardownIfIdle() {
  if (listeners.size > 0) return;
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

export function subscribeToJob(jobId: string, listener: Listener): () => void {
  if (!jobId) return () => {};
  listeners.set(jobId, listener);
  ensureSource();
  return () => {
    if (listeners.get(jobId) === listener) {
      listeners.delete(jobId);
    }
    teardownIfIdle();
  };
}

// Promise variant of subscribeToJob for inline-await flows.
export function waitForJob(
  jobId: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ images?: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      unsubscribe();
      reject(new DOMException("aborted", "AbortError"));
    };
    const unsubscribe = subscribeToJob(jobId, (update) => {
      if (update.status === "completed") {
        options.signal?.removeEventListener("abort", onAbort);
        resolve({ images: update.images });
      } else if (update.status === "failed") {
        options.signal?.removeEventListener("abort", onAbort);
        reject(new Error(update.error || "Job failed."));
      }
    });
    options.signal?.addEventListener("abort", onAbort);
  });
}
