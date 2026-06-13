import {
  buildVariantAvailability,
  type ReservationLike,
  type VariantAvailabilityMap,
  type VariantLike,
} from "@/lib/variantAvailability";

type ClientController = ReadableStreamDefaultController<Uint8Array>;

type ClientEntry = {
  controller: ClientController;
  reservationKey: string | null;
};

export type SSEAvailabilityPayload = {
  productId: string;
  cartCount: number;
  stock: number;
  variantAvailability: VariantAvailabilityMap | null;
};

export type SSEBroadcastInput = {
  productId: string;
  stock: number;
  variants: ReadonlyArray<VariantLike> | null | undefined;
  reservations: ReservationLike[];
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

export function broadcastAvailabilityChange(input: SSEBroadcastInput) {
  if (clients.size === 0) return;

  const hasVariants = Boolean(input.variants && input.variants.length > 0);
  const totalReservedQty = input.reservations.reduce((sum, r) => sum + qty(r), 0);

  for (const [id, entry] of clients) {
    const variantAvailability = hasVariants
      ? buildVariantAvailability(input.variants, input.reservations, entry.reservationKey)
      : null;

    const ownedQty = entry.reservationKey
      ? input.reservations
          .filter((r) => r.reservationKey === entry.reservationKey)
          .reduce((sum, r) => sum + qty(r), 0)
      : 0;

    const broadcastStock = hasVariants
      ? input.stock
      : Math.max(input.stock - (totalReservedQty - ownedQty), 0);

    const payload: SSEAvailabilityPayload = {
      productId: input.productId,
      cartCount: totalReservedQty,
      stock: broadcastStock,
      variantAvailability,
    };

    try {
      entry.controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    } catch {
      clients.delete(id);
    }
  }
}
