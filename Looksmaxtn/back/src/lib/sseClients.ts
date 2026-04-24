import {
  buildSizeAvailability,
  getSizeStockEntries,
  type SizeAvailabilityMap,
} from "@/lib/sizeAvailability";

type ClientController = ReadableStreamDefaultController<Uint8Array>;

type ClientEntry = {
  controller: ClientController;
  reservationKey: string | null;
};

export type SSEAvailabilityPayload = {
  productId: string;
  cartCount: number;
  stock: number;
  sizeAvailability: SizeAvailabilityMap | null;
  viewerBlocked: boolean;
};

export type SSEBroadcastInput = {
  productId: string;
  stock: number;
  sizeStock: unknown;
  reservations: Array<{ reservationKey: string; quantity?: number; size?: string }>;
};

const clients = new Map<string, ClientEntry>();
const encoder = new TextEncoder();

export function addSSEClient(id: string, controller: ClientController, reservationKey: string | null) {
  clients.set(id, { controller, reservationKey });
}

export function removeSSEClient(id: string) {
  clients.delete(id);
}

function qty(r: { quantity?: number }) {
  return Math.max(1, Number(r.quantity) || 1);
}

export function computeViewerBlocked(
  sizeStock: unknown,
  stock: number,
  reservations: Array<{ reservationKey: string; quantity?: number; size?: string }>,
  reservationKey: string | null,
): boolean {
  const entries = getSizeStockEntries(sizeStock);
  const hasSize = entries.length > 0;

  if (!hasSize) {
    const others = reservations
      .filter((r) => r.reservationKey !== reservationKey)
      .reduce((sum, r) => sum + qty(r), 0);
    const owned = reservationKey
      ? reservations
          .filter((r) => r.reservationKey === reservationKey)
          .reduce((sum, r) => sum + qty(r), 0)
      : 0;
    const stockVal = Math.max(stock, 0);
    if (owned > 0) return owned + others > stockVal;
    return stockVal > 0 && others >= stockVal;
  }

  let hasOwnedCart = false;
  let anyConflict = false;
  let everyFullSizeFlagged = true;
  let anyInStockSize = false;

  for (const [size, entry] of entries) {
    const sizeStockVal = Math.max(entry.stock ?? 0, 0);
    if (sizeStockVal <= 0) continue;
    anyInStockSize = true;

    let owned = 0;
    let others = 0;
    for (const r of reservations) {
      if ((r.size || "") !== size) continue;
      if (reservationKey && r.reservationKey === reservationKey) owned += qty(r);
      else others += qty(r);
    }

    if (owned > 0) hasOwnedCart = true;
    if (owned + others > sizeStockVal) anyConflict = true;
    if (others < sizeStockVal) everyFullSizeFlagged = false;
  }

  if (hasOwnedCart) return anyConflict;
  return anyInStockSize && everyFullSizeFlagged;
}

export function broadcastAvailabilityChange(input: SSEBroadcastInput) {
  if (clients.size === 0) return;

  const hasSizeStock = getSizeStockEntries(input.sizeStock).length > 0;
  const totalReservedQty = input.reservations.reduce((sum, r) => sum + qty(r), 0);

  for (const [id, entry] of clients) {
    const sizeAvailability = hasSizeStock
      ? buildSizeAvailability(input.sizeStock, input.reservations, entry.reservationKey)
      : null;

    const ownedQty = entry.reservationKey
      ? input.reservations
          .filter((r) => r.reservationKey === entry.reservationKey)
          .reduce((sum, r) => sum + qty(r), 0)
      : 0;

    const broadcastStock = hasSizeStock
      ? input.stock
      : Math.max(input.stock - (totalReservedQty - ownedQty), 0);

    const viewerBlocked = computeViewerBlocked(
      input.sizeStock,
      input.stock,
      input.reservations,
      entry.reservationKey,
    );

    const payload: SSEAvailabilityPayload = {
      productId: input.productId,
      cartCount: totalReservedQty,
      stock: broadcastStock,
      sizeAvailability,
      viewerBlocked,
    };

    try {
      entry.controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    } catch {
      clients.delete(id);
    }
  }
}
