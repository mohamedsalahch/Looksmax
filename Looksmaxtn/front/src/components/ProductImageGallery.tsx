"use client";

import { useMemo, useState } from "react";

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

  return (
    <div className="flex flex-col-reverse md:flex-row gap-3">
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
      <div className="flex-1 relative aspect-[3/4] md:aspect-auto md:h-[600px] bg-surface cursor-crosshair group overflow-hidden">
        {displayImages[activeIndex]?.url ? (
          <img
            src={displayImages[activeIndex].url}
            alt="Main product"
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        ) : (
          <div className="absolute inset-0 placeholder-img flex items-center justify-center">
            <span className="relative z-10 text-sm tracking-widest opacity-50">
              PRODUCT VIEW
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/[0.02] transition-colors duration-300 z-10 pointer-events-none" />
      </div>
    </div>
  );
}
