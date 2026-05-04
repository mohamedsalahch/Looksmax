type AdminEventClient = {
  controller: ReadableStreamDefaultController<Uint8Array>;
};

export type AdminOrderEventPayload = {
  _id: string;
  orderStatus: string;
  createdAt: string;
  user?: { name?: string; email?: string } | null;
  totalPrice?: number;
  isArchived?: boolean;
  items?: Array<{ product?: string; name: string; quantity: number }>;
};

export type AdminMessageEventPayload = {
  _id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export type AdminStoreEventPayload = {
  _id: string;
  name: string;
  storeName: string;
  email: string;
  category: string;
  categories?: string[];
  storeType: string;
  status: string;
  createdAt: string;
};

export type AdminProductEventPayload = {
  _id: string;
  name: string;
  brand: string;
  reference?: string;
  approvalStatus: string;
  createdAt: string;
  updatedAt?: string;
  visibilityStatus?: string;
  isActive?: boolean;
  changeType?: "created" | "updated";
  createdBy?: { id?: string; name?: string; email?: string } | null;
};

export type AdminEvent =
  | { type: "order:upsert"; order: AdminOrderEventPayload }
  | { type: "order:delete"; orderId: string }
  | { type: "message:upsert"; message: AdminMessageEventPayload }
  | { type: "message:delete"; messageId: string }
  | { type: "store:upsert"; store: AdminStoreEventPayload }
  | { type: "store:delete"; storeId: string }
  | { type: "product:upsert"; product: AdminProductEventPayload }
  | { type: "product:delete"; productId: string };

const clients = new Map<string, AdminEventClient>();
const encoder = new TextEncoder();

export function addAdminEventClient(
  id: string,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  clients.set(id, { controller });
}

export function removeAdminEventClient(id: string) {
  clients.delete(id);
}

export function sendAdminEvent(id: string, event: AdminEvent | { type: "connected" }) {
  const client = clients.get(id);
  if (!client) return;

  try {
    client.controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  } catch {
    clients.delete(id);
  }
}

export function broadcastAdminEvent(event: AdminEvent) {
  if (clients.size === 0) return;

  for (const [id, client] of clients) {
    try {
      client.controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      clients.delete(id);
    }
  }
}
