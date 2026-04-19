export type SizeStockEntry = { fullStock?: number; stock?: number };
export type SizeAvailabilityMap = Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }>;

export function getSizeStockEntries(sizeStock: unknown): Array<[string, SizeStockEntry]> {
  if (sizeStock instanceof Map) {
    return Array.from(sizeStock.entries());
  }

  if (!sizeStock || typeof sizeStock !== "object") return [];

  return Object.entries(sizeStock as Record<string, SizeStockEntry>);
}

export function buildSizeAvailability(
  sizeStock: unknown,
  reservations: Array<{ reservationKey: string; quantity?: number; size?: string }>,
  reservationKey: string | null
): SizeAvailabilityMap | null {
  const entries = getSizeStockEntries(sizeStock);
  if (entries.length === 0) return null;

  return Object.fromEntries(
    entries.map(([size, entry]) => {
      const sizeReservations = reservations.filter((reservation) => (reservation.size || "") === size);
      const reservedByOthers = sizeReservations
        .filter((reservation) => reservation.reservationKey !== reservationKey)
        .reduce((sum, reservation) => sum + Math.max(1, Number(reservation.quantity) || 1), 0);
      const stock = Math.max(entry.stock ?? 0, 0);

      return [
        size,
        {
          stock,
          available: stock > 0,
          reservedElsewhere: stock > 0 && reservedByOthers > 0 && reservedByOthers >= stock,
        },
      ] as const;
    })
  );
}

export function getDefaultSelectableSize(sizes: string[], sizeAvailability: SizeAvailabilityMap | null) {
  return sizes.find((size) => sizeAvailability?.[size]?.available) || sizes[0] || "";
}

export function getSelectedSizeStock(
  sizeAvailability: SizeAvailabilityMap | null,
  selectedSize: string,
  fallbackStock: number
) {
  if (selectedSize && sizeAvailability?.[selectedSize]) {
    return sizeAvailability[selectedSize].stock;
  }

  return fallbackStock;
}

export function getDisplayStock(stock: number, sizeAvailability: SizeAvailabilityMap | null) {
  const sizeEntries = sizeAvailability ? Object.values(sizeAvailability) : [];
  if (sizeEntries.length === 0) return stock;
  return sizeEntries.reduce((sum, entry) => sum + Math.max(entry.stock ?? 0, 0), 0);
}
