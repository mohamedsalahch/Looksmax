export type VariantColor = { name: string; hex: string } | null;

export type VariantLike = {
  _id: unknown;
  size: string;
  color: VariantColor;
  stock: number;
};

export type VariantAvailabilityEntry = {
  variantId: string;
  size: string;
  color: VariantColor;
  stock: number;
  available: boolean;
  reservedElsewhere: boolean;
};

export type VariantAvailabilityMap = Record<string, VariantAvailabilityEntry>;

export type ReservationLike = {
  reservationKey: string;
  quantity?: number;
  variant?: unknown;
};

export function variantIdString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function qty(r: { quantity?: number }) {
  return Math.max(1, Number(r.quantity) || 1);
}

export function buildVariantAvailability(
  variants: ReadonlyArray<VariantLike> | undefined | null,
  reservations: ReservationLike[],
  reservationKey: string | null,
): VariantAvailabilityMap | null {
  if (!variants || variants.length === 0) return null;

  const result: VariantAvailabilityMap = {};
  for (const variant of variants) {
    const variantId = variantIdString(variant._id);
    if (!variantId) continue;

    const stock = Math.max(variant.stock ?? 0, 0);
    let reservedByOthers = 0;
    let ownedQuantity = 0;
    for (const r of reservations) {
      if (variantIdString(r.variant) !== variantId) continue;
      if (r.reservationKey === reservationKey) ownedQuantity += qty(r);
      else reservedByOthers += qty(r);
    }

    result[variantId] = {
      variantId,
      size: variant.size,
      color: variant.color,
      stock,
      available: stock > 0,
      reservedElsewhere:
        stock > 0 &&
        reservedByOthers > 0 &&
        (reservedByOthers >= stock || reservedByOthers + ownedQuantity > stock),
    };
  }

  return result;
}

export function getDefaultSelectableVariantId(
  variants: ReadonlyArray<{ _id: unknown }>,
  availability: VariantAvailabilityMap | null,
): string {
  if (!variants || variants.length === 0) return "";
  const firstAvailable = variants.find((v) => availability?.[variantIdString(v._id)]?.available);
  return variantIdString((firstAvailable ?? variants[0])._id);
}

export function getSelectedVariantStock(
  availability: VariantAvailabilityMap | null,
  variantId: string,
  fallbackStock: number,
): number {
  if (variantId && availability?.[variantId]) return availability[variantId].stock;
  return fallbackStock;
}

export function getDisplayStock(
  fallbackStock: number,
  availability: VariantAvailabilityMap | null,
): number {
  if (!availability) return fallbackStock;
  return Object.values(availability).reduce((sum, entry) => sum + Math.max(entry.stock, 0), 0);
}
