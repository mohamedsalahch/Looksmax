import { generateId } from "@/lib/uuid";

export type VariantRow = {
  uiId: string;
  _id?: string;
  size: string;
  color: string | null;
  fullStock: number;
  stock: number;
  soldQuantity: number;
  conditionScore: number | null;
  images: number[];
  restockAmount: string;
  savingRestock: boolean;
};

export type OutgoingVariant = {
  _id?: string;
  size: string;
  color: string | null;
  fullStock: number;
  conditionScore: number | null;
  images: number[];
};

type ApiVariant = {
  _id?: string;
  size?: string;
  color?: string | null;
  fullStock?: number;
  stock?: number;
  soldQuantity?: number;
  conditionScore?: number | null;
  images?: number[];
};

export function normalizeHex(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const prefixed = raw.startsWith("#") ? raw : `#${raw}`;
  return prefixed.toLowerCase();
}

export function parseApiVariants(apiVariants: unknown): VariantRow[] {
  if (!Array.isArray(apiVariants)) return [];

  return apiVariants.map((variant: ApiVariant) => {
    const fullStock = Math.max(0, Number(variant.fullStock ?? variant.stock ?? 0));
    const stock = Math.max(0, Number(variant.stock ?? fullStock));
    return {
      uiId: generateId(),
      ...(variant._id ? { _id: String(variant._id) } : {}),
      size: String(variant.size || "").trim(),
      color: normalizeHex(variant.color) || null,
      fullStock,
      stock,
      soldQuantity: Math.max(0, Number(variant.soldQuantity || 0)),
      conditionScore:
        typeof variant.conditionScore === "number"
          ? Math.max(0, Math.min(10, Number(variant.conditionScore) || 0))
          : null,
      images: Array.isArray(variant.images)
        ? variant.images.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index >= 0)
        : [],
      restockAmount: "0",
      savingRestock: false,
    };
  });
}

export function toOutgoingVariant(row: VariantRow): OutgoingVariant {
  return {
    ...(row._id ? { _id: row._id } : {}),
    size: row.size.trim(),
    color: normalizeHex(row.color) || null,
    fullStock: Math.max(0, Number(row.fullStock || 0)),
    conditionScore:
      typeof row.conditionScore === "number"
        ? Math.max(0, Math.min(10, Number(row.conditionScore) || 0))
        : null,
    images: Array.isArray(row.images)
      ? row.images.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index >= 0)
      : [],
  };
}

export function groupVariantsByColor(rows: VariantRow[]) {
  const grouped = new Map<string, VariantRow[]>();
  for (const row of rows) {
    const key = normalizeHex(row.color);
    const existing = grouped.get(key) || [];
    existing.push(row);
    grouped.set(key, existing);
  }
  return grouped;
}
