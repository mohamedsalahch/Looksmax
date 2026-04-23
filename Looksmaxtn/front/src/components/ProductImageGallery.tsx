"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

interface ProductImage {
  url: string;
  isMain: boolean;
}

export default function ProductImageGallery({ images = [] }: { images?: ProductImage[] }) {
  const displayImages = useMemo(() => {
    if (images.length === 0) return [{ url: "", isMain: true }];
    const sorted = [...images];
    sorted.sort((a, b) => Number(b.isMain) - Number(a.isMain));
    return sorted;
  }, [images]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomActive, setIsZoomActive] = useState(false);
  const [isZoomPinned, setIsZoomPinned] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [zoomPoint, setZoomPoint] = useState({ x: 50, y: 50 });
  const [zoomPosition, setZoomPosition] = useState({ left: 0, top: 0 });
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const imageShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setIsDesktop(media.matches);
    sync();

    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (!isDesktop || !isZoomActive) return;

    const handleOutsideClick = (event: globalThis.MouseEvent) => {
      if (!galleryRef.current) return;
      if (galleryRef.current.contains(event.target as Node)) return;
      setIsZoomActive(false);
      setIsZoomPinned(false);
    };

    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [isDesktop, isZoomActive]);

  const calculateZoomState = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!imageShellRef.current) return null;

    const rect = imageShellRef.current.getBoundingClientRect();
    const nextX = Math.min(Math.max(((event.clientX - rect.left) / rect.width) * 100, 0), 100);
    const nextY = Math.min(Math.max(((event.clientY - rect.top) / rect.height) * 100, 0), 100);
    const overlayWidth = Math.min(160, rect.width - 16);
    const overlayHeight = Math.min(220, rect.height - 16);
    const preferredLeft = event.clientX - rect.left + 14;
    const preferredTop = event.clientY - rect.top + 14;

    return {
      point: { x: nextX, y: nextY },
      position: {
        left: Math.min(Math.max(preferredLeft, -overlayWidth + 24), rect.width - 24),
        top: Math.min(Math.max(preferredTop, -overlayHeight + 24), rect.height - 24),
      },
    };
  };

  const updateZoomState = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDesktop || !isZoomActive) return;

    const next = calculateZoomState(event);
    if (!next) return;

    setZoomPoint(next.point);
    setZoomPosition(next.position);
  };

  const toggleZoom = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDesktop || !displayImages[activeIndex]?.url) return;

    if (isZoomActive) {
      setIsZoomActive(false);
      setIsZoomPinned(false);
      return;
    }

    const next = calculateZoomState(event);
    if (next) {
      setZoomPoint(next.point);
      setZoomPosition(next.position);
    }
    setIsZoomPinned(true);
    setIsZoomActive(true);
  };

  const handleMouseEnter = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDesktop || !displayImages[activeIndex]?.url) return;

    if (!isZoomPinned && !isZoomActive) return;

    const next = calculateZoomState(event);
    if (next) {
      setZoomPoint(next.point);
      setZoomPosition(next.position);
    }

    setIsZoomActive(true);
  };

  const handleMouseLeave = () => {
    if (!isDesktop) return;
    setIsZoomActive(false);
  };

  return (
    <div ref={galleryRef} className="flex flex-col-reverse md:flex-row gap-3">
      {/* Thumbnails */}
      {displayImages.length > 1 && (
        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto md:max-h-[600px] scrollbar-hide">
          {displayImages.map((img, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`relative shrink-0 w-16 h-20 md:w-20 md:h-24 overflow-hidden cursor-pointer transition-all duration-200 ${
                activeIndex === index
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              {img.url ? (
                <img
                  src={img.url}
                  alt={`Thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="absolute inset-0 placeholder-img" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Main Image */}
      <div
        ref={imageShellRef}
        className={`flex-1 relative aspect-[3/4] md:aspect-auto md:h-[600px] bg-surface overflow-visible ${
          isDesktop && displayImages[activeIndex]?.url ? "cursor-zoom-in" : "cursor-default"
        }`}
        onClick={toggleZoom}
        onMouseEnter={handleMouseEnter}
        onMouseMove={updateZoomState}
        onMouseLeave={handleMouseLeave}
      >
        {displayImages[activeIndex]?.url ? (
          <>
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={displayImages[activeIndex].url}
                alt="Main product"
                className="absolute inset-0 w-full h-full object-cover"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            {isDesktop && isZoomActive && (
              <div
                className="absolute z-20 hidden md:block overflow-hidden border border-border-color bg-background shadow-[0_18px_48px_rgba(26,26,26,0.18)] pointer-events-none"
                style={{
                  left: `${zoomPosition.left}px`,
                  top: `${zoomPosition.top}px`,
                  width: "160px",
                  height: "220px",
                }}
              >
                <div
                  className="absolute inset-0 rounded-[14px]"
                  style={{
                    backgroundImage: `url(${displayImages[activeIndex].url})`,
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "360%",
                    backgroundPosition: `${zoomPoint.x}% ${zoomPoint.y}%`,
                    transform: "scale(1.01)",
                  }}
                />
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 placeholder-img flex items-center justify-center">
            <span className="relative z-10 text-sm tracking-widest opacity-50">
              PRODUCT VIEW
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-foreground/0 hover:bg-foreground/[0.02] transition-colors duration-300 z-10 pointer-events-none" />
      </div>
    </div>
  );
}
