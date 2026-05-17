type StoreUserEventClient = {
  userId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

export type StoreUserEvent =
  | {
      type: "outfit:update";
      jobId: string;
      status: "processing" | "completed" | "failed";
      images?: { front?: string; back?: string };
      errorMessage?: string;
    }
  | {
      type: "body-profile:update";
      status: "processing" | "completed" | "failed";
      enhancedImagePath?: string;
      errorMessage?: string;
    }
  | { type: "connected" };

const clients = new Map<string, StoreUserEventClient>();
const encoder = new TextEncoder();

export function addStoreUserEventClient(
  id: string,
  userId: string,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  clients.set(id, { userId, controller });
}

export function removeStoreUserEventClient(id: string) {
  clients.delete(id);
}

export function sendStoreUserEvent(id: string, event: StoreUserEvent) {
  const client = clients.get(id);
  if (!client) return;
  try {
    client.controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  } catch {
    clients.delete(id);
  }
}

export function publishStoreUserEvent(userId: string, event: StoreUserEvent) {
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
