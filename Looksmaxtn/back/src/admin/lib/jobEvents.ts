type JobEventClient = {
  userId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

export type JobKind = "enhance" | "generate";
export type JobStatus = "processing" | "completed" | "failed";

export type JobEvent =
  | {
      type: "job:update";
      kind: JobKind;
      jobId: string;
      status: JobStatus;
      images?: Record<string, string>;
      error?: string;
    }
  | { type: "connected" };

const clients = new Map<string, JobEventClient>();
const encoder = new TextEncoder();

export function addJobEventClient(
  id: string,
  userId: string,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  clients.set(id, { userId, controller });
}

export function removeJobEventClient(id: string) {
  clients.delete(id);
}

export function sendJobEvent(id: string, event: JobEvent) {
  const client = clients.get(id);
  if (!client) return;
  try {
    client.controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  } catch {
    clients.delete(id);
  }
}

export function publishJobEvent(userId: string, event: JobEvent) {
  if (clients.size === 0) return;
  for (const [id, client] of clients) {
    if (client.userId !== userId) continue;
    try {
      client.controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      clients.delete(id);
    }
  }
}
