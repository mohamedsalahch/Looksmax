import mongoose from "mongoose";

export type RequestedVariantColor = { name?: string; hex: string } | null;

export type RequestedVariant = {
  _id?: string;
  size: string;
  color: RequestedVariantColor;
  fullStock: number;
  conditionScore: number | null;
  images: number[];
};

export type StoredVariant = {
  _id: mongoose.Types.ObjectId;
  size: string;
  color: RequestedVariantColor;
  fullStock: number;
  stock: number;
  conditionScore: number | null;
  images: number[];
};

function clamp01To10(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(10, num));
}

function normalizeHex(value: unknown): string {
  const str = String(value || "").trim().toLowerCase();
  if (!str) return "";
  return str.startsWith("#") ? str : `#${str}`;
}

function normalizeColor(raw: unknown): RequestedVariantColor {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { name?: unknown; hex?: unknown };
  const hex = normalizeHex(obj.hex);
  if (!hex) return null;
  const name = String(obj.name || "").trim();
  return name ? { name, hex } : { hex };
}

function normalizeImages(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0);
}

export function parseRequestedVariants(raw: unknown): RequestedVariant[] {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "[]") return [];
    try {
      return parseRequestedVariants(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): RequestedVariant | null => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const fullStock = Math.max(0, Math.floor(Number(obj.fullStock ?? obj.stock ?? 0)) || 0);
      const variant: RequestedVariant = {
        size: String(obj.size ?? "").trim(),
        color: normalizeColor(obj.color),
        fullStock,
        conditionScore: clamp01To10(obj.conditionScore),
        images: normalizeImages(obj.images),
      };
      const id = typeof obj._id === "string" ? obj._id.trim() : "";
      if (id && mongoose.Types.ObjectId.isValid(id)) {
        variant._id = id;
      }
      return variant;
    })
    .filter((v): v is RequestedVariant => v !== null);
}

export function singleDefaultVariant(params: {
  fullStock: number;
  conditionScore: number | null;
}): RequestedVariant {
  return {
    size: "",
    color: null,
    fullStock: Math.max(0, Math.floor(Number(params.fullStock)) || 0),
    conditionScore: params.conditionScore,
    images: [],
  };
}

export function sumVariantStock(variants: ReadonlyArray<{ stock: number }>): number {
  return variants.reduce((sum, v) => sum + Math.max(0, v.stock ?? 0), 0);
}

export function sumVariantFullStock(variants: ReadonlyArray<{ fullStock: number }>): number {
  return variants.reduce((sum, v) => sum + Math.max(0, v.fullStock ?? 0), 0);
}

export function deriveSizes(variants: ReadonlyArray<{ size: string }>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of variants) {
    const size = v.size?.trim();
    if (size && !seen.has(size)) {
      seen.add(size);
      result.push(size);
    }
  }
  return result;
}

export function deriveColors(
  variants: ReadonlyArray<{ color: RequestedVariantColor }>,
): Array<{ name?: string; hex: string }> {
  const seen = new Set<string>();
  const result: Array<{ name?: string; hex: string }> = [];
  for (const v of variants) {
    if (v.color && !seen.has(v.color.hex)) {
      seen.add(v.color.hex);
      result.push(v.color);
    }
  }
  return result;
}

export function averageVariantConditionScore(
  variants: ReadonlyArray<{ conditionScore: number | null }>,
): number | null {
  const scores = variants
    .map((v) => v.conditionScore)
    .filter((s): s is number => typeof s === "number");
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}
