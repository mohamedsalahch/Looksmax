export type VariantColor = { name: string; hex: string } | null;

export type VariantAvailabilityEntry = {
  variantId: string;
  size: string;
  color: VariantColor;
  stock: number;
  available: boolean;
  reservedElsewhere: boolean;
};

export type VariantAvailabilityMap = Record<string, VariantAvailabilityEntry>;

export type VariantSummary = {
  _id: string;
  size: string;
  color: VariantColor;
};

export function getDefaultSelectableVariantId(
  variants: ReadonlyArray<VariantSummary> | undefined | null,
  availability: VariantAvailabilityMap | null,
): string {
  if (!variants || variants.length === 0) return "";
  const firstAvailable = variants.find((v) => availability?.[v._id]?.available);
  return (firstAvailable ?? variants[0])._id;
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
