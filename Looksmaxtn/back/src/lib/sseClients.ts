import {
  buildVariantAvailability,
  variantIdString,
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
  viewerBlocked: boolean;
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

export function computeViewerBlocked(
  variants: ReadonlyArray<VariantLike> | null | undefined,
  stock: number,
  reservations: ReservationLike[],
  reservationKey: string | null,
): boolean {
  const hasVariants = Boolean(variants && variants.length > 0);

  if (!hasVariants) {
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
  let everyFullVariantFlagged = true;
  let anyInStockVariant = false;

  for (const variant of variants!) {
    const variantId = variantIdString(variant._id);
    const stockVal = Math.max(variant.stock ?? 0, 0);
    if (stockVal <= 0) continue;
    anyInStockVariant = true;

    let owned = 0;
    let others = 0;
    for (const r of reservations) {
      if (variantIdString(r.variant) !== variantId) continue;
      if (reservationKey && r.reservationKey === reservationKey) owned += qty(r);
      else others += qty(r);
    }

    if (owned > 0) hasOwnedCart = true;
    if (owned + others > stockVal) anyConflict = true;
    if (others < stockVal) everyFullVariantFlagged = false;
  }

  if (hasOwnedCart) return anyConflict;
  return anyInStockVariant && everyFullVariantFlagged;
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

    const viewerBlocked = computeViewerBlocked(
      input.variants,
      input.stock,
      input.reservations,
      entry.reservationKey,
    );

    const payload: SSEAvailabilityPayload = {
      productId: input.productId,
      cartCount: totalReservedQty,
      stock: broadcastStock,
      variantAvailability,
      viewerBlocked,
    };

    try {
      entry.controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    } catch {
      clients.delete(id);
    }
  }
}
