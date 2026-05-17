"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import colorsData from "@/lib/colors.json";
import type { PaletteColor } from "@/lib/generationPalette";

export interface InspectorSource {
  url: string;
  label?: string;
}

interface ColorPickerProps {
  value: string;
  onChange: (color: PaletteColor) => void;
  inspectorSources?: InspectorSource[];
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

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

type SamplerMode = "grid" | "canvas";

export default function ColorPicker({ value, onChange, inspectorSources, label }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeFamily, setActiveFamily] = useState<FamilyName | null>(null);
  const [query, setQuery] = useState("");
  const [samplerOpen, setSamplerOpen] = useState(false);
  const [samplerMode, setSamplerMode] = useState<SamplerMode>("grid");
  const [samplerUrl, setSamplerUrl] = useState<string | null>(null);
  const [samplerError, setSamplerError] = useState<string | null>(null);
  const [sampledHex, setSampledHex] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedUrlRef = useRef<string | null>(null);

  const selectedSwatch = useMemo(() => findColorByName(value), [value]);
  const hasInspector = true;

  const resetSampler = () => {
    setSamplerOpen(false);
    setSamplerMode("grid");
    setSamplerUrl(null);
    setSamplerError(null);
    setSampledHex(null);
    if (uploadedUrlRef.current) {
      URL.revokeObjectURL(uploadedUrlRef.current);
      uploadedUrlRef.current = null;
    }
  };

  const handleFilePicked = (file: File | null) => {
    if (!file) return;
    if (uploadedUrlRef.current) {
      URL.revokeObjectURL(uploadedUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    uploadedUrlRef.current = url;
    setSamplerUrl(url);
    setSampledHex(null);
    setSamplerError(null);
    setSamplerMode("canvas");
  };

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setActiveFamily(null);
      setQuery("");
      resetSampler();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (uploadedUrlRef.current) {
        URL.revokeObjectURL(uploadedUrlRef.current);
        uploadedUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (samplerMode !== "canvas" || !samplerUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    setSamplerError(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxW = 280;
      const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
      canvas.width = maxW;
      canvas.height = Math.max(1, Math.round(maxW * ratio));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.onerror = () => setSamplerError("Could not load image");
    img.src = samplerUrl;
  }, [samplerMode, samplerUrl]);

  const samplePixel = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.floor(((clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    try {
      const data = ctx.getImageData(x, y, 1, 1).data;
      setSampledHex(rgbToHex(data[0], data[1], data[2]));
    } catch {
      setSamplerError("Image blocked by CORS — can't sample");
    }
  };

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
        <div className="absolute z-50 mt-2 w-[min(300px,calc(100vw-2rem))] rounded-lg border border-border bg-bg-card shadow-xl">

          {!samplerOpen && !activeFamily && (
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

          {!samplerOpen && activeFamily && (
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
                <div className="grid grid-cols-8 gap-1 sm:flex sm:gap-px sm:overflow-x-auto sm:pb-1">
                  {(filteredItems ?? []).map((color) => {
                    const active = value.trim().toLowerCase() === color.name.toLowerCase();
                    return (
                      <button
                        key={color.hex + color.name}
                        type="button"
                        title={`${color.name} (${color.hex})`}
                        onClick={() => { onChange({ name: color.name, hex: color.hex }); setOpen(false); }}
                        className={`h-7 w-7 sm:h-6 sm:w-3 rounded-full sm:rounded-none shrink-0 transition-all ${
                          active ? "outline outline-2 outline-accent" : ""
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

          {samplerOpen && samplerMode === "grid" && (
            <>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <button
                  type="button"
                  onClick={resetSampler}
                  className="text-[11px] text-text-secondary hover:text-text-primary transition-colors"
                >
                  ←
                </button>
                <span className="text-[10px] uppercase tracking-[0.2em] text-text-primary">Sample from image</span>
              </div>
              <div className="p-3 space-y-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded border border-dashed border-border bg-bg-secondary px-3 py-3 text-[11px] uppercase tracking-[0.18em] text-text-primary transition-colors hover:border-accent hover:text-accent"
                >
                  Take photo or upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleFilePicked(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                {inspectorSources && inspectorSources.length > 0 && (
                  <>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-text-secondary">Or pick from product</p>
                    <div className="grid grid-cols-3 gap-2">
                      {inspectorSources.map((source) => (
                        <button
                          key={source.url}
                          type="button"
                          onClick={() => { setSamplerUrl(source.url); setSamplerMode("canvas"); }}
                          title={source.label || "Image"}
                          className="aspect-square overflow-hidden rounded border border-border bg-bg-secondary transition-colors hover:border-accent"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={source.url} alt={source.label || "Source"} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {samplerOpen && samplerMode === "canvas" && (
            <>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <button
                  type="button"
                  onClick={() => { setSamplerMode("grid"); setSamplerUrl(null); setSampledHex(null); setSamplerError(null); }}
                  className="text-[11px] text-text-secondary hover:text-text-primary transition-colors"
                >
                  ←
                </button>
                <span className="text-[10px] uppercase tracking-[0.2em] text-text-primary">Tap to sample</span>
              </div>
              <div className="p-3 space-y-2">
                <div className="relative w-full overflow-hidden rounded border border-border bg-bg-secondary">
                  <canvas
                    ref={canvasRef}
                    className="block w-full select-none"
                    style={{ touchAction: "none" }}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); samplePixel(e.clientX, e.clientY); }}
                    onPointerMove={(e) => { if (e.buttons === 0 && e.pointerType === "mouse") return; samplePixel(e.clientX, e.clientY); }}
                  />
                </div>
                {samplerError && (
                  <p className="text-[10px] text-danger">{samplerError}</p>
                )}
                <div className="flex items-center gap-2">
                  <span
                    className="h-6 w-6 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: sampledHex || "transparent" }}
                  />
                  <span className="font-mono text-[11px] text-text-primary">{sampledHex || "—"}</span>
                  <button
                    type="button"
                    disabled={!sampledHex}
                    onClick={() => {
                      if (!sampledHex) return;
                      onChange({ name: sampledHex, hex: sampledHex });
                      setOpen(false);
                    }}
                    className="ml-auto rounded border border-border px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    Use color
                  </button>
                </div>
              </div>
            </>
          )}

          {hasInspector && !samplerOpen && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => { setSamplerOpen(true); setActiveFamily(null); }}
                className="w-full rounded border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-text-secondary transition-colors hover:border-accent hover:text-accent"
              >
                Sample from image
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
