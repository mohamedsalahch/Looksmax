"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import colorsData from "@/lib/colors.json";
import type { PaletteColor } from "@/lib/generationPalette";

interface ColorPickerProps {
  value: string;
  onChange: (color: PaletteColor) => void;
  onPickInspector?: () => void;
  label?: string;
}

interface RGB { r: number; g: number; b: number }
interface HSL { h: number; s: number; l: number }

interface CategorizedColor extends PaletteColor {
  hsl: HSL;
  luminance: number;
}

const FAMILY_ORDER = [
  "Reds", "Oranges", "Yellows", "Greens", "Teals",
  "Blues", "Purples", "Pinks", "Browns", "Greys", "Whites", "Blacks",
] as const;

type FamilyName = (typeof FAMILY_ORDER)[number];

const FAMILY_HEX: Record<FamilyName, string> = {
  Reds:    "#C0392B",
  Oranges: "#E67E22",
  Yellows: "#F1C40F",
  Greens:  "#27AE60",
  Teals:   "#1ABC9C",
  Blues:   "#2980B9",
  Purples: "#8E44AD",
  Pinks:   "#E91E8C",
  Browns:  "#795548",
  Greys:   "#9E9E9E",
  Whites:  "#F0F0F0",
  Blacks:  "#212121",
};

function hexToRgb(hex: string): RGB {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      default:  h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: RGB) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function classify(hsl: HSL): FamilyName {
  const { h, s, l } = hsl;
  if (s < 0.12) {
    if (l < 0.2) return "Blacks";
    if (l > 0.8) return "Whites";
    return "Greys";
  }
  if (h >= 15 && h < 50 && l < 0.45 && s < 0.75) return "Browns";
  if (h < 15 || h >= 345) return "Reds";
  if (h < 50)  return "Oranges";
  if (h < 70)  return "Yellows";
  if (h < 165) return "Greens";
  if (h < 210) return "Teals";
  if (h < 265) return "Blues";
  if (h < 315) return "Purples";
  return "Pinks";
}

function dedupeByName(colors: CategorizedColor[]) {
  const seen = new Set<string>();
  return colors.filter((c) => {
    const key = c.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ALL_COLORS: CategorizedColor[] = (colorsData as PaletteColor[]).map((c) => {
  const rgb = hexToRgb(c.hex);
  return { ...c, hsl: rgbToHsl(rgb), luminance: relativeLuminance(rgb) };
});

const GROUPED: Record<FamilyName, CategorizedColor[]> = (() => {
  const groups = Object.fromEntries(
    FAMILY_ORDER.map((name) => [name, [] as CategorizedColor[]])
  ) as Record<FamilyName, CategorizedColor[]>;
  for (const color of ALL_COLORS) groups[classify(color.hsl)].push(color);
  for (const name of FAMILY_ORDER) {
    const deduped = dedupeByName(groups[name]);
    deduped.sort((a, b) => a.luminance - b.luminance);
    groups[name] = deduped;
  }
  return groups;
})();

function findColorByName(name: string): CategorizedColor | undefined {
  const lower = name.trim().toLowerCase();
  if (!lower) return undefined;
  return ALL_COLORS.find((c) => c.name.toLowerCase() === lower);
}

export default function ColorPicker({ value, onChange, onPickInspector, label }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeFamily, setActiveFamily] = useState<FamilyName | null>(null);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSwatch = useMemo(() => findColorByName(value), [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveFamily(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // reset drill-down when closing
  useEffect(() => {
    if (!open) { setActiveFamily(null); setQuery(""); }
  }, [open]);

  const filteredItems = useMemo(() => {
    if (!activeFamily) return null;
    const q = query.trim().toLowerCase();
    if (!q) return GROUPED[activeFamily];
    return GROUPED[activeFamily].filter((c) => c.name.toLowerCase().includes(q));
  }, [activeFamily, query]);

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-bg-card px-3 py-1.5 text-[11px] text-text-primary transition-colors hover:border-accent hover:text-accent"
      >
        <span
          className="h-5 w-5 shrink-0 rounded-full border border-border"
          style={{
            backgroundColor: selectedSwatch?.hex || "transparent",
            backgroundImage: selectedSwatch
              ? undefined
              : "linear-gradient(135deg, transparent 45%, var(--border,#888) 45%, var(--border,#888) 55%, transparent 55%)",
          }}
        />
        <span className="truncate max-w-[140px]">{value || label || "Select color"}</span>
        <span className="text-[9px] text-text-secondary">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-[300px] rounded-lg border border-border bg-bg-card shadow-xl">

          {/* ── Family grid ── */}
          {!activeFamily && (
            <div className="p-3 grid grid-cols-6 gap-2">
              {FAMILY_ORDER.map((family) => {
                const isFamilyOfSelected =
                  selectedSwatch && classify(selectedSwatch.hsl) === family;
                return (
                  <button
                    key={family}
                    type="button"
                    title={family}
                    onClick={() => setActiveFamily(family)}
                    className="flex flex-col items-center gap-1 group"
                  >
                    <span
                      className={`h-8 w-8 rounded-full border-2 transition-all group-hover:scale-110 ${
                        isFamilyOfSelected ? "border-accent scale-110" : "border-border"
                      }`}
                      style={{ backgroundColor: FAMILY_HEX[family] }}
                    />
                    <span className="text-[8px] uppercase tracking-[0.15em] text-text-secondary leading-none">
                      {family}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Color strip ── */}
          {activeFamily && (
            <>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <button
                  type="button"
                  onClick={() => { setActiveFamily(null); setQuery(""); }}
                  className="text-[11px] text-text-secondary hover:text-text-primary transition-colors"
                >
                  ←
                </button>
                <span
                  className="h-4 w-4 rounded-full border border-border shrink-0"
                  style={{ backgroundColor: FAMILY_HEX[activeFamily] }}
                />
                <span className="text-[10px] uppercase tracking-[0.2em] text-text-primary">{activeFamily}</span>
                <input
                  type="text"
                  value={query}
                  autoFocus
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="ml-auto w-24 rounded border border-border bg-bg-secondary px-2 py-0.5 text-xs focus:border-accent transition-colors"
                />
              </div>
              <div className="p-3">
                <div className="flex gap-px overflow-x-auto pb-1">
                  {(filteredItems ?? []).map((color) => {
                    const active = value.trim().toLowerCase() === color.name.toLowerCase();
                    return (
                      <button
                        key={color.hex + color.name}
                        type="button"
                        title={`${color.name} (${color.hex})`}
                        onClick={() => { onChange({ name: color.name, hex: color.hex }); setOpen(false); }}
                        className={`h-6 w-3 shrink-0 transition-all ${
                          active ? "scale-y-125 outline outline-2 outline-accent" : "hover:scale-y-110"
                        }`}
                        style={{ backgroundColor: color.hex }}
                      />
                    );
                  })}
                </div>
                {value && classify(findColorByName(value)?.hsl ?? rgbToHsl(hexToRgb("#000"))) === activeFamily && (
                  <p className="mt-2 text-[10px] text-text-secondary">
                    Selected: <span className="text-text-primary">{value}</span>
                  </p>
                )}
              </div>
            </>
          )}

          {/* Inspector */}
          {onPickInspector && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={async () => { await onPickInspector(); setOpen(false); }}
                className="w-full rounded border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-text-secondary transition-colors hover:border-accent hover:text-accent"
              >
                Pick from screen (inspector)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
