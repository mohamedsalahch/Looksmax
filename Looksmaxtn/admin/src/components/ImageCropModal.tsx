"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type Rect = { x: number; y: number; w: number; h: number };
type DragMode = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type ViewState = { z: number; panX: number; panY: number };
type Size = { w: number; h: number };

const MIN_FRAME = 24; // smallest crop-box edge in screen px
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

const HANDLES: { mode: DragMode; className: string }[] = [
  { mode: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
  { mode: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize" },
  { mode: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
  { mode: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize" },
  { mode: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize" },
  { mode: "s", className: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize" },
  { mode: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize" },
  { mode: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize" },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function isDirectlyFetchable(src: string) {
  return (
    src.startsWith("blob:") ||
    src.startsWith("data:") ||
    src.startsWith("/") ||
    (!src.startsWith("http://") && !src.startsWith("https://"))
  );
}

/**
 * Crop modal with a FIXED crop window. The crop box stays put in screen space
 * while the image zooms/pans behind it (Instagram-style), so zooming in
 * magnifies whatever sits inside the box. Remote URLs load through the
 * media-fetch proxy so the export canvas is never tainted. onConfirm receives a
 * brand-new File — the caller adds it as a new picture, never replacing the
 * original.
 */
export default function ImageCropModal({
  src,
  title = "Crop picture",
  onCancel,
  onConfirm,
}: {
  src: string;
  title?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [mime, setMime] = useState("image/png");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [natural, setNatural] = useState<Size | null>(null);
  const [containerSize, setContainerSize] = useState<Size>({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState>({ z: 1, panX: 0, panY: 0 });
  // Crop frame in container (screen) px — fixed relative to the viewport.
  const [frame, setFrame] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const viewInitRef = useRef(false);
  const frameInitRef = useRef(false);
  const cropDragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startFrame: Rect;
    containerW: number;
    containerH: number;
  } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number; z: number } | null>(null);

  // Fit the natural image into the container (contain); display scale = fit * zoom.
  const fit =
    natural && containerSize.w > 0 && containerSize.h > 0
      ? Math.min(containerSize.w / natural.w, containerSize.h / natural.h)
      : 0;
  const baseW = natural ? natural.w * fit : 0;
  const baseH = natural ? natural.h * fit : 0;
  const imgScreenW = baseW * view.z;
  const imgScreenH = baseH * view.z;

  // Latest geometry for listeners attached once.
  const geomRef = useRef({ view, baseW, baseH, containerW: containerSize.w, containerH: containerSize.h });
  geomRef.current = { view, baseW, baseH, containerW: containerSize.w, containerH: containerSize.h };

  useEffect(() => {
    let active = true;
    let createdUrl = "";
    setLoading(true);
    setLoadError("");

    (async () => {
      try {
        const fetchUrl = isDirectlyFetchable(src) ? src : `/api/media-fetch?url=${encodeURIComponent(src)}`;
        const response = await fetch(fetchUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const blob = await response.blob();
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setMime(blob.type && blob.type.startsWith("image/") ? blob.type : "image/png");
        setResolvedUrl(createdUrl);
      } catch {
        if (active) setLoadError("Could not load this image for cropping.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  // Track the preview container size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [resolvedUrl]);

  // Default crop frame: centered, 70% of the container.
  useEffect(() => {
    if (frameInitRef.current || containerSize.w === 0 || containerSize.h === 0) return;
    frameInitRef.current = true;
    const w = containerSize.w * 0.7;
    const h = containerSize.h * 0.7;
    setFrame({ x: (containerSize.w - w) / 2, y: (containerSize.h - h) / 2, w, h });
  }, [containerSize]);

  // Center the image at fit-zoom once both the image and container are measured.
  useEffect(() => {
    if (viewInitRef.current || !natural || containerSize.w === 0 || baseW === 0) return;
    viewInitRef.current = true;
    setView({ z: 1, panX: (containerSize.w - baseW) / 2, panY: (containerSize.h - baseH) / 2 });
  }, [natural, containerSize, baseW, baseH]);

  const applyZoom = useCallback((cx: number, cy: number, factor: number) => {
    const { view: current, baseW: bw, baseH: bh } = geomRef.current;
    if (bw === 0) return;
    const imgW = bw * current.z;
    const imgH = bh * current.z;
    const nextZ = clamp(current.z * factor, MIN_ZOOM, MAX_ZOOM);
    if (nextZ === current.z) return;
    // Keep the image point under (cx, cy) fixed while the image scales.
    const fx = (cx - current.panX) / imgW;
    const fy = (cy - current.panY) / imgH;
    const nextImgW = bw * nextZ;
    const nextImgH = bh * nextZ;
    setView({ z: nextZ, panX: cx - fx * nextImgW, panY: cy - fy * nextImgH });
  }, []);

  // Native non-passive wheel listener so we can preventDefault and zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rectBox = el.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      applyZoom(event.clientX - rectBox.left, event.clientY - rectBox.top, factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom, resolvedUrl]);

  const zoomByButton = (factor: number) => {
    const { containerW, containerH } = geomRef.current;
    applyZoom(containerW / 2, containerH / 2, factor);
  };

  const resetView = () => {
    const { baseW: bw, baseH: bh, containerW, containerH } = geomRef.current;
    setView({ z: 1, panX: (containerW - bw) / 2, panY: (containerH - bh) / 2 });
  };

  // --- Crop frame move / resize (screen px) ---
  const handleCropPointerMove = useCallback((event: globalThis.PointerEvent) => {
    const drag = cropDragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const { containerW: CW, containerH: CH } = drag;
    let { x, y, w, h } = drag.startFrame;

    if (drag.mode === "move") {
      x = clamp(x + dx, 0, CW - w);
      y = clamp(y + dy, 0, CH - h);
    } else {
      if (drag.mode.includes("e")) w = clamp(w + dx, MIN_FRAME, CW - x);
      if (drag.mode.includes("s")) h = clamp(h + dy, MIN_FRAME, CH - y);
      if (drag.mode.includes("w")) {
        const nextX = clamp(x + dx, 0, x + w - MIN_FRAME);
        w += x - nextX;
        x = nextX;
      }
      if (drag.mode.includes("n")) {
        const nextY = clamp(y + dy, 0, y + h - MIN_FRAME);
        h += y - nextY;
        y = nextY;
      }
    }

    setFrame({ x, y, w, h });
  }, []);

  const endCropDrag = useCallback(() => {
    cropDragRef.current = null;
    window.removeEventListener("pointermove", handleCropPointerMove);
    window.removeEventListener("pointerup", endCropDrag);
  }, [handleCropPointerMove]);

  const startCropDrag = (event: ReactPointerEvent, mode: DragMode) => {
    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startFrame: frame,
      containerW: containerSize.w,
      containerH: containerSize.h,
    };
    window.addEventListener("pointermove", handleCropPointerMove);
    window.addEventListener("pointerup", endCropDrag);
  };

  // --- Pan the image behind the fixed crop box ---
  const handlePanPointerMove = useCallback((event: globalThis.PointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    setView({ z: pan.z, panX: pan.panX + (event.clientX - pan.startX), panY: pan.panY + (event.clientY - pan.startY) });
  }, []);

  const endPan = useCallback(() => {
    panRef.current = null;
    window.removeEventListener("pointermove", handlePanPointerMove);
    window.removeEventListener("pointerup", endPan);
  }, [handlePanPointerMove]);

  const startPan = (event: ReactPointerEvent) => {
    if (imgScreenW === 0) return;
    panRef.current = { startX: event.clientX, startY: event.clientY, panX: view.panX, panY: view.panY, z: view.z };
    window.addEventListener("pointermove", handlePanPointerMove);
    window.addEventListener("pointerup", endPan);
  };

  useEffect(() => () => {
    endCropDrag();
    endPan();
  }, [endCropDrag, endPan]);

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img || !natural || fit === 0 || frame.w === 0 || frame.h === 0) return;
    const scale = fit * view.z; // screen px per natural px

    // Source region (natural px) currently under the fixed crop box.
    const sx = (frame.x - view.panX) / scale;
    const sy = (frame.y - view.panY) / scale;
    const sw = frame.w / scale;
    const sh = frame.h / scale;

    // Output resolution: the crop box mapped to native px at fit. This stays
    // constant as you zoom — zooming magnifies the content instead.
    const dw = Math.max(1, Math.round(frame.w / fit));
    const dh = Math.max(1, Math.round(frame.h / fit));

    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Clamp the source region to the image and draw it into the matching part of
    // the canvas, so a box that overhangs the image edge leaves blank margins
    // rather than stretching.
    const scaleXOut = dw / sw;
    const scaleYOut = dh / sh;
    const cx0 = Math.max(0, sx);
    const cy0 = Math.max(0, sy);
    const cx1 = Math.min(natural.w, sx + sw);
    const cy1 = Math.min(natural.h, sy + sh);
    if (cx1 > cx0 && cy1 > cy0) {
      ctx.drawImage(
        img,
        cx0,
        cy0,
        cx1 - cx0,
        cy1 - cy0,
        (cx0 - sx) * scaleXOut,
        (cy0 - sy) * scaleYOut,
        (cx1 - cx0) * scaleXOut,
        (cy1 - cy0) * scaleYOut,
      );
    }

    const outputMime = mime === "image/jpeg" || mime === "image/webp" ? mime : "image/png";
    const quality = outputMime === "image/png" ? undefined : 0.95;
    setSaving(true);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setSaving(false);
          setLoadError("Could not export the cropped image.");
          return;
        }
        const extension = outputMime.split("/")[1] || "png";
        const file = new File([blob], `crop-${Date.now()}.${extension}`, { type: blob.type || outputMime });
        onConfirm(file);
      },
      outputMime,
      quality,
    );
  };

  const ready = !loading && !loadError && Boolean(resolvedUrl);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 p-4">
      <div className="mb-3 flex w-full max-w-3xl items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white">{title}</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => zoomByButton(1 / 1.2)}
              disabled={!ready}
              aria-label="Zoom out"
              className="h-7 w-7 border border-white/30 bg-black/60 text-sm leading-none text-white transition-colors hover:bg-black disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-[3rem] text-center text-[10px] font-mono uppercase tracking-wider text-white/70">
              {Math.round(view.z * 100)}%
            </span>
            <button
              type="button"
              onClick={() => zoomByButton(1.2)}
              disabled={!ready}
              aria-label="Zoom in"
              className="h-7 w-7 border border-white/30 bg-black/60 text-sm leading-none text-white transition-colors hover:bg-black disabled:opacity-40"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={resetView}
            disabled={!ready}
            className="border border-white/30 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-white transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close cropper"
            className="h-7 w-7 border border-white/30 bg-black/60 text-lg leading-none text-white transition-colors hover:bg-black"
          >
            ×
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onPointerDown={startPan}
        className="relative h-[66vh] w-full max-w-3xl touch-none select-none overflow-hidden bg-bg-card"
        style={{ cursor: ready ? "grab" : "default" }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] uppercase tracking-wider text-text-secondary">
            Loading image…
          </div>
        )}
        {loadError && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] uppercase tracking-wider text-danger">
            {loadError}
          </div>
        )}
        {ready && (
          <>
            <img
              ref={imgRef}
              src={resolvedUrl}
              alt="Crop source"
              draggable={false}
              onLoad={(event) =>
                setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })
              }
              className="absolute left-0 top-0 max-w-none select-none"
              style={{
                width: imgScreenW || undefined,
                height: imgScreenH || undefined,
                transform: `translate(${view.panX}px, ${view.panY}px)`,
                opacity: imgScreenW > 0 ? 1 : 0,
              }}
            />
            {frame.w > 0 && (
              <div
                className="absolute cursor-move border border-white/90"
                style={{
                  left: frame.x,
                  top: frame.y,
                  width: frame.w,
                  height: frame.h,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                }}
                onPointerDown={(event) => startCropDrag(event, "move")}
              >
                {HANDLES.map((handle) => (
                  <span
                    key={handle.mode}
                    onPointerDown={(event) => startCropDrag(event, handle.mode)}
                    className={`absolute h-3 w-3 rounded-full border border-text-primary bg-white ${handle.className}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex w-full max-w-3xl items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-wider text-white/60">
          Scroll/± to zoom the image (crop box stays fixed) · drag image to pan · drag box/handles to set crop
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-white/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-white transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!ready || saving}
            className="bg-accent px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-bg-primary transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving…" : "Apply crop"}
          </button>
        </div>
      </div>
    </div>
  );
}
