"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { isOptimizableImageSrc } from "@/lib/imageOptimization";

interface ProductImage {
  url: string;
  isMain: boolean;
  gender?: "men" | "women" | null;
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
  priority = false,
  sizes = "100vw",
}: {
  url: string;
  alt: string;
  className: string;
  videoClassName?: string;
  showControls?: boolean;
  priority?: boolean;
  sizes?: string;
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

  return (
    <Image
      src={url}
      alt={alt}
      width={0}
      height={0}
      sizes={sizes}
      className={className}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      unoptimized={!isOptimizableImageSrc(url)}
    />
  );
}

function ProductLightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: ProductImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const imageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const scrollingProgrammatically = useRef(false);

  // Initial scroll to the image that was clicked
  useEffect(() => {
    const el = imageRefs.current[initialIndex];
    if (el) {
      el.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }, []);

  // Scroll active thumbnail into view whenever active index changes
  useEffect(() => {
    const container = thumbRef.current;
    if (!container) return;
    const thumb = container.children[activeIndex] as HTMLElement | undefined;
    if (thumb) {
      thumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [activeIndex]);

  // Track which image is centered in the scroll container
  const handleScroll = useCallback(() => {
    if (scrollingProgrammatically.current) return;
    const container = scrollRef.current;
    if (!container) return;
    const center = container.scrollTop + container.clientHeight / 2;
    let closest = 0;
    let minDist = Infinity;
    imageRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const dist = Math.abs(ref.offsetTop + ref.offsetHeight / 2 - center);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    setActiveIndex(closest);
  }, []);

  const scrollToImage = (index: number) => {
    setActiveIndex(index);
    scrollingProgrammatically.current = true;
    imageRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => { scrollingProgrammatically.current = false; }, 600);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center text-foreground/60 hover:text-foreground bg-surface/60 hover:bg-surface transition-colors"
        aria-label="Close"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <line x1="1" y1="1" x2="17" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="17" y1="1" x2="1" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Scrollable image stack */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {images.map((img, i) => (
          <div
            key={i}
            ref={(el) => { imageRefs.current[i] = el; }}
            className="w-full bg-background flex justify-center"
          >
            {img.url ? (
              <MediaPreview
                url={img.url}
                alt={`Photo ${i + 1}`}
                className="w-3/5 h-auto object-cover block"
                videoClassName="w-3/5 h-auto object-cover block"
                showControls={isVideoUrl(img.url)}
                sizes="60vw"
              />
            ) : (
              <div className="w-3/5 aspect-[3/4] bg-surface" />
            )}
          </div>
        ))}
      </div>

      {/* Bottom-left thumbnail strip */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-4 z-10">
          <div
            ref={thumbRef}
            className="flex flex-col gap-1.5 max-h-64 overflow-y-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollToImage(i)}
                className={`shrink-0 w-12 h-16 overflow-hidden border-2 transition-all duration-200 cursor-pointer ${
                  activeIndex === i
                    ? "border-foreground opacity-100"
                    : "border-transparent opacity-40 hover:opacity-70"
                }`}
              >
                {img.url ? (
                  <MediaPreview
                    url={img.url}
                    alt={`Thumb ${i + 1}`}
                    className="w-full h-full object-cover"
                    videoClassName="w-full h-full object-cover"
                    sizes="48px"
                  />
                ) : (
                  <div className="w-full h-full bg-surface" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

type GalleryVariant = {
  color?: string | null;
  images?: number[];
};

function getIndicesForHex(hex: string | null, variants: GalleryVariant[] | undefined | null) {
  if (!hex || !variants) return [];
  const target = hex.toLowerCase();
  for (const variant of variants) {
    if (variant?.color?.toLowerCase() === target) {
      return Array.isArray(variant.images) ? [...variant.images] : [];
    }
  }
  return [];
}

export default function ProductImageGallery({
  images = [],
  variants,
  initialColorHex = null,
  defaultGender = null,
}: {
  images?: ProductImage[];
  variants?: GalleryVariant[] | null;
  initialColorHex?: string | null;
  defaultGender?: "men" | "women" | null;
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
  const [activeGender, setActiveGender] = useState<"men" | "women" | null>(defaultGender);

  const selectedColorOriginalIndices = useMemo(() => {
    const indices = getIndicesForHex(activeColorHex, variants);
    return indices.length > 0 ? [...indices].sort((a, b) => a - b) : [];
  }, [activeColorHex, variants]);

  const visibleImages = useMemo(() => {
    const genderFilter = (img: ProductImage) => !img.gender || !activeGender || img.gender === activeGender;
    if (selectedColorOriginalIndices.length > 0) {
      const orderedImages = selectedColorOriginalIndices
        .map((origIdx) => images[origIdx])
        .filter((img): img is ProductImage => Boolean(img?.url) && genderFilter(img));
      if (orderedImages.length > 0) {
        return orderedImages;
      }
    }
    return displayImages.filter(genderFilter);
  }, [displayImages, images, selectedColorOriginalIndices, activeGender]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomActive, setIsZoomActive] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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
    const genderHandler = (e: Event) => {
      const { gender } = (e as CustomEvent<{ gender: string }>).detail;
      if (gender === "men" || gender === "women") {
        setActiveGender(gender);
        setActiveIndex(0);
      }
    };
    window.addEventListener("product:gallery:filterGender", genderHandler);
    return () => window.removeEventListener("product:gallery:filterGender", genderHandler);
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
      const allowedOriginalIndices = getIndicesForHex(activeColorHex, variants);
      if (allowedOriginalIndices.length === 0) {
        setActiveIndex(displayIdx);
        return;
      }
      const sorted = [...allowedOriginalIndices].sort((a, b) => a - b);
      const visibleIdx = sorted.indexOf(detail.index);
      if (visibleIdx !== -1) setActiveIndex(visibleIdx);
    };
    window.addEventListener("product:gallery:selectIndex", handler);
    return () => window.removeEventListener("product:gallery:selectIndex", handler);
  }, [originalToDisplay, activeColorHex, variants, selectedColorOriginalIndices]);
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

  const handleImageClick = () => {
    if (visibleImages[activeIndex]?.url && !isVideoUrl(visibleImages[activeIndex].url)) {
      setLightboxOpen(true);
    }
  };

  return (
    <>
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
                    sizes="80px"
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
              className={`relative mx-auto w-fit max-w-full bg-transparent overflow-visible touch-pan-y cursor-pointer`}
              onMouseEnter={handleMouseEnter}
              onMouseMove={updateZoomState}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onClick={handleImageClick}
            >
              <MediaPreview
                url={visibleImages[activeIndex].url}
                alt="Main product"
                className="block max-w-full max-h-[600px] w-auto h-auto object-contain"
                videoClassName="block max-w-full max-h-[600px] w-auto h-auto object-contain"
                showControls
                priority={activeIndex === 0}
                sizes="(min-width: 768px) 50vw, 100vw"
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

      {lightboxOpen && (
        <ProductLightbox
          images={visibleImages}
          initialIndex={activeIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
