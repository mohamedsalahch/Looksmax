"use client";

import { withAuthRequest } from "@/lib/authClient";

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
let streamAbortController: AbortController | null = null;
let sourceInitPromise: Promise<void> | null = null;
let refCount = 0;

async function ensureSource() {
  if (streamAbortController) return;
  if (sourceInitPromise) return sourceInitPromise;

  let activeController: AbortController | null = null;
  sourceInitPromise = (async () => {
    const controller = new AbortController();
    activeController = controller;
    streamAbortController = controller;

    try {
      const response = await fetch(
        "/api/jobs/events",
        withAuthRequest({
          method: "GET",
          headers: {
            Accept: "text/event-stream",
          },
          cache: "no-store",
          signal: controller.signal,
        })
      );

      if (!response.ok || !response.body) {
        throw new Error(`Job event stream failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          const data = rawEvent
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");

          if (data) {
            let payload: unknown;
            try {
              payload = JSON.parse(data);
            } catch {
              separatorIndex = buffer.indexOf("\n\n");
              continue;
            }

            if (
              payload &&
              typeof payload === "object" &&
              (payload as { type?: string }).type === "job:update"
            ) {
              const update = payload as JobUpdate & { type: "job:update" };
              const listener = listeners.get(update.jobId);
              if (listener) {
                listener(update);
                if (update.status === "completed" || update.status === "failed") {
                  listeners.delete(update.jobId);
                }
              }
            }
          }

          separatorIndex = buffer.indexOf("\n\n");
        }
      }

      if (!controller.signal.aborted && listeners.size > 0) {
        streamAbortController = null;
        void ensureSource();
      }
    } catch {
      if (!controller.signal.aborted && listeners.size > 0) {
        streamAbortController = null;
        void ensureSource();
      }
    }
  })().finally(() => {
    if (activeController && streamAbortController === activeController) {
      streamAbortController = null;
    }
    sourceInitPromise = null;
  });

  return sourceInitPromise;
}

function teardownIfIdle() {
  if (refCount > 0 || listeners.size > 0) return;
  if (streamAbortController) {
    streamAbortController.abort();
    streamAbortController = null;
  }
}

export function subscribeToJob(jobId: string, listener: Listener): () => void {
  if (!jobId) return () => {};
  refCount += 1;
  listeners.set(jobId, listener);
  void ensureSource();
  return () => {
    if (listeners.get(jobId) === listener) {
      listeners.delete(jobId);
    }
    refCount = Math.max(0, refCount - 1);
    teardownIfIdle();
  };
}
