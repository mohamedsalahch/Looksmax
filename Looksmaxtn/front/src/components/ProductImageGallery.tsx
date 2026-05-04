"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from "react";

interface ProductImage {
  url: string;
  isMain: boolean;
}

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"];

function isVideoUrl(url: string) {
  const normalized = url.split("?")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function MediaPreview({
  url,
  alt,
  className,
  videoClassName,
  showControls = false,
}: {
  url: string;
  alt: string;
  className: string;
  videoClassName?: string;
  showControls?: boolean;
}) {
  if (isVideoUrl(url)) {
    return (
      <video
        src={url}
        aria-label={alt}
        className={videoClassName || className}
        autoPlay
        loop
        muted
        playsInline
        controls={showControls}
        preload="metadata"
      />
    );
  }

  return <img src={url} alt={alt} className={className} loading="eager" fetchPriority="high" decoding="async" />;
}

export default function ProductImageGallery({
  images = [],
  colorImages,
  initialColorHex = null,
}: {
  images?: ProductImage[];
  colorImages?: Record<string, number[]> | null;
  initialColorHex?: string | null;
}) {
  const { displayImages, originalToDisplay } = useMemo(() => {
    if (images.length === 0) return { displayImages: [{ url: "", isMain: true }], originalToDisplay: new Map<number, number>() };
    const indexed = images.map((img, i) => ({ img, originalIndex: i }));
    indexed.sort((a, b) => Number(b.img.isMain) - Number(a.img.isMain));
    const map = new Map<number, number>();
    indexed.forEach(({ originalIndex }, displayIdx) => map.set(originalIndex, displayIdx));
    return { displayImages: indexed.map(({ img }) => img), originalToDisplay: map };
  }, [images]);

  const [activeColorHex, setActiveColorHex] = useState<string | null>(initialColorHex);
  const selectedColorOriginalIndices = useMemo(() => {
    if (!activeColorHex || !colorImages?.[activeColorHex]) return [];
    return [...colorImages[activeColorHex]].sort((a, b) => a - b);
  }, [activeColorHex, colorImages]);

  const visibleImages = useMemo(() => {
    if (selectedColorOriginalIndices.length > 0) {
      const orderedImages = selectedColorOriginalIndices
        .map((origIdx) => images[origIdx])
        .filter((img): img is ProductImage => Boolean(img?.url));
      if (orderedImages.length > 0) {
        return orderedImages;
      }
    }
    return displayImages;
  }, [displayImages, images, selectedColorOriginalIndices]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomActive, setIsZoomActive] = useState(false);

  useEffect(() => {
    const filterHandler = (e: Event) => {
      const { hex } = (e as CustomEvent<{ hex: string | null; imageUrl?: string }>).detail;
      setActiveColorHex(hex);
      setActiveIndex(0);
      setIsZoomActive(false);
    };
    window.addEventListener("product:gallery:filterColorway", filterHandler);
    return () => window.removeEventListener("product:gallery:filterColorway", filterHandler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ index: number }>).detail;
      if (selectedColorOriginalIndices.length > 0) {
        const visibleIdx = selectedColorOriginalIndices.indexOf(detail.index);
        if (visibleIdx !== -1) setActiveIndex(visibleIdx);
        return;
      }

      const displayIdx = originalToDisplay.get(detail.index);
      if (displayIdx === undefined) return;
      if (!activeColorHex || !colorImages?.[activeColorHex]) {
        setActiveIndex(displayIdx);
        return;
      }
      const allowedOriginalIndices = [...(colorImages[activeColorHex] ?? [])].sort((a, b) => a - b);
      const visibleIdx = allowedOriginalIndices.indexOf(detail.index);
      if (visibleIdx !== -1) setActiveIndex(visibleIdx);
    };
    window.addEventListener("product:gallery:selectIndex", handler);
    return () => window.removeEventListener("product:gallery:selectIndex", handler);
  }, [originalToDisplay, activeColorHex, colorImages, selectedColorOriginalIndices]);
  const [isDesktop, setIsDesktop] = useState(false);
  const [zoomPoint, setZoomPoint] = useState({ x: 50, y: 50 });
  const [zoomPosition, setZoomPosition] = useState({ left: 0, top: 0 });
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const imageShellRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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
    };

    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [isDesktop, isZoomActive]);

  const calculateZoomState = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!imageShellRef.current) return null;
    if (isVideoUrl(visibleImages[activeIndex]?.url || "")) return null;

    const rect = imageShellRef.current.getBoundingClientRect();
    const overlayWidth = Math.max(0, Math.min(240, rect.width - 16));
    const overlayHeight = Math.max(0, Math.min(320, rect.height - 16));
    const nextX = Math.min(Math.max(((event.clientX - rect.left) / rect.width) * 100, 0), 100);
    const nextY = Math.min(Math.max(((event.clientY - rect.top) / rect.height) * 100, 0), 100);
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

  const handleMouseEnter = (event: ReactMouseEvent<HTMLDivElement>) => {
    const activeUrl = visibleImages[activeIndex]?.url || "";
    if (!isDesktop || !activeUrl) return;
    if (isVideoUrl(activeUrl)) return;

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

  const showNextImage = () => {
    setActiveIndex((current) => Math.min(current + 1, visibleImages.length - 1));
  };

  const showPreviousImage = () => {
    setActiveIndex((current) => Math.max(current - 1, 0));
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (isDesktop || visibleImages.length <= 1) return;
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (isDesktop || visibleImages.length <= 1 || !touchStartRef.current) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;

    if (deltaX > 0) {
      showPreviousImage();
    } else {
      showNextImage();
    }
  };

  return (
    <div ref={galleryRef} className="flex flex-col-reverse md:flex-row gap-3">
      {/* Thumbnails */}
      {visibleImages.length > 1 && (
        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto md:max-h-[600px] scrollbar-hide">
          {visibleImages.map((img, index) => (
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
                <MediaPreview
                  url={img.url}
                  alt={`Thumbnail ${index + 1}`}
                  className="w-full h-full object-contain"
                  videoClassName="w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 placeholder-img" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Main Image */}
      <div className="flex-1 w-full">
        {visibleImages[activeIndex]?.url ? (
          <div
            ref={imageShellRef}
            className={`relative mx-auto w-fit max-w-full bg-transparent overflow-visible touch-pan-y ${
              isDesktop && visibleImages[activeIndex]?.url ? "cursor-zoom-in" : "cursor-default"
            }`}
            onMouseEnter={handleMouseEnter}
            onMouseMove={updateZoomState}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <MediaPreview
              url={visibleImages[activeIndex].url}
              alt="Main product"
              className="block max-w-full max-h-[600px] w-auto h-auto object-contain"
              videoClassName="block max-w-full max-h-[600px] w-auto h-auto object-contain"
              showControls
            />
            {isDesktop && isZoomActive && !isVideoUrl(visibleImages[activeIndex].url) && (
              <div
                className="absolute z-20 hidden md:block overflow-hidden border border-border-color bg-background shadow-[0_18px_48px_rgba(26,26,26,0.18)] pointer-events-none"
                style={{
                  left: `${zoomPosition.left}px`,
                  top: `${zoomPosition.top}px`,
                  width: "240px",
                  height: "320px",
                }}
              >
                <div
                  className="absolute inset-0 rounded-[14px]"
                  style={{
                    backgroundImage: `url(${visibleImages[activeIndex].url})`,
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "450%",
                    backgroundPosition: `${zoomPoint.x}% ${zoomPoint.y}%`,
                    transform: "scale(1.01)",
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div
            ref={imageShellRef}
            className="relative mx-auto w-full aspect-[3/4] md:min-h-[600px] placeholder-img flex items-center justify-center"
            onMouseEnter={handleMouseEnter}
            onMouseMove={updateZoomState}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <span className="relative z-10 text-sm tracking-widest opacity-50">
              PRODUCT VIEW
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
