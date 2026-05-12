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

  const result: SizeAvailabilityMap = {};
  // Aggregate bare-size totals for composite "size / #color" keys so that
  // storefront lookups by bare size still see the real stock.
  const bareAggregates = new Map<string, { stock: number; reservedByOthers: number; ownedQuantity: number }>();

  for (const [size, entry] of entries) {
    const sizeReservations = reservations.filter((reservation) => (reservation.size || "") === size);
    const reservedByOthers = sizeReservations
      .filter((reservation) => reservation.reservationKey !== reservationKey)
      .reduce((sum, reservation) => sum + Math.max(1, Number(reservation.quantity) || 1), 0);
    const ownedQuantity = sizeReservations
      .filter((reservation) => reservation.reservationKey === reservationKey)
      .reduce((sum, reservation) => sum + Math.max(1, Number(reservation.quantity) || 1), 0);
    const stock = Math.max(entry.stock ?? 0, 0);

    result[size] = {
      stock,
      available: stock > 0,
      reservedElsewhere: stock > 0 && reservedByOthers > 0 && (reservedByOthers >= stock || reservedByOthers + ownedQuantity > stock),
    };

    if (size.includes(" / ")) {
      const bareSize = size.split(" / ")[0];
      const current = bareAggregates.get(bareSize) || { stock: 0, reservedByOthers: 0, ownedQuantity: 0 };
      current.stock += stock;
      current.reservedByOthers += reservedByOthers;
      current.ownedQuantity += ownedQuantity;
      bareAggregates.set(bareSize, current);
    }
  }

  for (const [bareSize, totals] of bareAggregates) {
    // Always overwrite — a bare entry alongside composite keys is a legacy
    // phantom (stock=0) and should be replaced by the real aggregate.
    result[bareSize] = {
      stock: totals.stock,
      available: totals.stock > 0,
      reservedElsewhere:
        totals.stock > 0 && totals.reservedByOthers > 0 &&
        (totals.reservedByOthers >= totals.stock || totals.reservedByOthers + totals.ownedQuantity > totals.stock),
    };
  }

  return result;
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
