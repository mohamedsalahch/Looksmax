"use client";

import { useState } from "react";

interface ProductImage {
  id: number;
  label: string;
}

const images: ProductImage[] = [
  { id: 1, label: "FRONT" },
  { id: 2, label: "BACK" },
  { id: 3, label: "DETAIL" },
  { id: 4, label: "ON MODEL" },
  { id: 5, label: "FLAT LAY" },
];

export default function ProductImageGallery() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="flex flex-col-reverse md:flex-row gap-3">
      {/* Thumbnails */}
      <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto md:max-h-[600px] scrollbar-hide">
        {images.map((img, index) => (
          <button
            key={img.id}
            onClick={() => setActiveIndex(index)}
            className={`shrink-0 w-16 h-20 md:w-20 md:h-24 placeholder-img cursor-pointer transition-all duration-200 ${
              activeIndex === index
                ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                : "opacity-60 hover:opacity-100"
            }`}
          >
            <span className="relative z-10 text-[8px] tracking-wider opacity-60">
              {img.label}
            </span>
          </button>
        ))}
      </div>

      {/* Main Image */}
      <div className="flex-1 relative aspect-[3/4] md:aspect-auto md:h-[600px] placeholder-img cursor-crosshair group overflow-hidden">
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/[0.02] transition-colors duration-300 z-10" />
        <span className="relative z-10 text-sm tracking-widest opacity-50">
          {images[activeIndex].label} VIEW
        </span>
      </div>
    </div>
  );
}
