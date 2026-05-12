"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SamplerSource {
  url: string;
  label?: string;
}

interface ImageColorSamplerProps {
  open: boolean;
  onClose: () => void;
  onPick: (hex: string) => void;
  sources?: SamplerSource[];
  title?: string;
}

type Step = "choose" | "sample";

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export default function ImageColorSampler({ open, onClose, onPick, sources, title = "Sample a color" }: ImageColorSamplerProps) {
  const [step, setStep] = useState<Step>("choose");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sampledHex, setSampledHex] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const reset = useCallback(() => {
    setStep("choose");
    setImageUrl(null);
    setSampledHex(null);
    setError(null);
    setPickerPos({ x: 0.5, y: 0.5 });
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open]);

  useEffect(() => {
    if (step !== "sample" || !imageUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    setError(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxSide = 600;
      const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
      const w = Math.min(maxSide, img.naturalWidth);
      const h = Math.max(1, Math.round(w * ratio));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      setPickerPos({ x: 0.5, y: 0.5 });
      try {
        const cx = Math.floor(w / 2);
        const cy = Math.floor(h / 2);
        const data = ctx.getImageData(cx, cy, 1, 1).data;
        setSampledHex(rgbToHex(data[0], data[1], data[2]));
      } catch {
        // CORS — will be reported on first interaction
      }
    };
    img.onerror = () => setError("Could not load image (CORS or network).");
    img.src = imageUrl;
  }, [step, imageUrl]);

  const sampleAtFraction = (fx: number, fy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const cx = Math.min(canvas.width - 1, Math.max(0, Math.floor(fx * canvas.width)));
    const cy = Math.min(canvas.height - 1, Math.max(0, Math.floor(fy * canvas.height)));
    try {
      const data = ctx.getImageData(cx, cy, 1, 1).data;
      setSampledHex(rgbToHex(data[0], data[1], data[2]));
    } catch {
      setError("Image is CORS-blocked — can't read pixels.");
    }
  };

  const updatePicker = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const fy = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    setPickerPos({ x: fx, y: fy });
    sampleAtFraction(fx, fy);
  };

  const nudge = (dx: number, dy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stepX = 1 / canvas.width;
    const stepY = 1 / canvas.height;
    setPickerPos((current) => {
      const nx = Math.min(1, Math.max(0, current.x + dx * stepX));
      const ny = Math.min(1, Math.max(0, current.y + dy * stepY));
      sampleAtFraction(nx, ny);
      return { x: nx, y: ny };
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {step === "sample" && (
            <button
              type="button"
              onClick={() => { setStep("choose"); setImageUrl(null); setSampledHex(null); setError(null); }}
              className="text-text-secondary hover:text-text-primary transition-colors"
              aria-label="Back"
            >
              ←
            </button>
          )}
          <span className="text-[11px] uppercase tracking-[0.2em] text-text-primary">
            {step === "choose" ? title : "Tap to sample"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {step === "choose" && (
          <div className="space-y-3 p-4">
            {sources && sources.length > 0 ? (
              <>
                <p className="text-[9px] uppercase tracking-[0.2em] text-text-secondary">Pick a photo to sample</p>
                <div className="grid grid-cols-2 gap-2">
                  {sources.map((source) => (
                    <button
                      key={source.url}
                      type="button"
                      onClick={() => { setImageUrl(source.url); setStep("sample"); }}
                      title={source.label || "Image"}
                      className="group flex flex-col items-center gap-1.5 overflow-hidden rounded border border-border bg-bg-secondary transition-colors hover:border-accent"
                    >
                      <div className="aspect-square w-full overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={source.url} alt={source.label || "Source"} className="h-full w-full object-cover" />
                      </div>
                      {source.label && (
                        <span className="pb-1.5 text-[9px] uppercase tracking-[0.18em] text-text-secondary group-hover:text-accent">
                          {source.label}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="rounded border border-dashed border-border bg-bg-secondary px-3 py-6 text-center text-[11px] text-text-secondary">
                Upload front/back images for this colorway first, then come back here to sample a color from them.
              </p>
            )}
          </div>
        )}

        {step === "sample" && (
          <div className="space-y-3 p-4">
            <div
              className="relative w-full overflow-hidden rounded border border-border bg-bg-secondary"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                updatePicker(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 0) return;
                e.preventDefault();
                updatePicker(e.clientX, e.clientY);
              }}
              onKeyDown={(e) => {
                const map: Record<string, [number, number]> = {
                  ArrowLeft: [-1, 0],
                  ArrowRight: [1, 0],
                  ArrowUp: [0, -1],
                  ArrowDown: [0, 1],
                };
                const delta = map[e.key];
                if (!delta) return;
                e.preventDefault();
                const mult = e.shiftKey ? 10 : 1;
                nudge(delta[0] * mult, delta[1] * mult);
              }}
              tabIndex={0}
            >
              <canvas ref={canvasRef} className="pointer-events-none block w-full select-none" />
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pickerPos.x * 100}%`, top: `${pickerPos.y * 100}%` }}
              >
                <div
                  className="h-9 w-9 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_2px_6px_rgba(0,0,0,0.4)]"
                  style={{ backgroundColor: sampledHex || "transparent" }}
                />
                <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" />
              </div>
            </div>
            {error && <p className="text-[11px] text-danger">{error}</p>}
            <p className="text-[10px] text-text-secondary">Drag the circle to move it. Use arrow keys for pixel-precise nudging (Shift for bigger steps).</p>
            <div className="flex items-center gap-3">
              <span
                className="h-8 w-8 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: sampledHex || "transparent" }}
              />
              <span className="font-mono text-xs text-text-primary">{sampledHex || "—"}</span>
              <button
                type="button"
                disabled={!sampledHex}
                onClick={() => { if (sampledHex) { onPick(sampledHex); onClose(); } }}
                className="ml-auto rounded border border-border bg-foreground px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-background transition-colors hover:bg-accent disabled:opacity-50"
              >
                Use color
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
