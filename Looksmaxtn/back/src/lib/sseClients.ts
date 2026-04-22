type ClientController = ReadableStreamDefaultController<Uint8Array>;

// Module-level singleton — persists for the lifetime of the Node.js process.
// Safe in Docker / traditional Node.js. Resets on hot-reload in dev (acceptable).
const clients = new Map<string, ClientController>();
const encoder = new TextEncoder();

export function addSSEClient(id: string, controller: ClientController) {
  clients.set(id, controller);
}

export function removeSSEClient(id: string) {
  clients.delete(id);
}

export function broadcastAvailabilityChange(productId: string, cartCount: number) {
  if (clients.size === 0) return;
  const chunk = encoder.encode(`data: ${JSON.stringify({ productId, cartCount })}\n\n`);
  for (const [id, controller] of clients) {
    try {
      controller.enqueue(chunk);
    } catch {
      // Client disconnected — remove silently
      clients.delete(id);
    }
  }
}
