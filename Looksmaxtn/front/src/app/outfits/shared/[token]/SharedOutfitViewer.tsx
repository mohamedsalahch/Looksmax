"use client";

import { useEffect, useMemo, useState } from "react";

type SharedOutfitViewerProps = {
  name: string;
  images: string[];
};

export default function SharedOutfitViewer({
  name,
  images,
}: SharedOutfitViewerProps) {
  const [zoomedImageIndex, setZoomedImageIndex] = useState<number | null>(null);

  const activeZoomedImage = useMemo(() => {
    if (zoomedImageIndex === null) return "";
    return images[zoomedImageIndex] || "";
  }, [images, zoomedImageIndex]);

  useEffect(() => {
    document.body.classList.toggle("shared-outfit-zoom-open", zoomedImageIndex !== null);
    return () => {
      document.body.classList.remove("shared-outfit-zoom-open");
    };
  }, [zoomedImageIndex]);

  const showPreviousImage = () => {
    if (zoomedImageIndex === null || images.length <= 1) return;
    setZoomedImageIndex(zoomedImageIndex === 0 ? images.length - 1 : zoomedImageIndex - 1);
  };

  const showNextImage = () => {
    if (zoomedImageIndex === null || images.length <= 1) return;
    setZoomedImageIndex(zoomedImageIndex === images.length - 1 ? 0 : zoomedImageIndex + 1);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {images.map((image, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setZoomedImageIndex(index)}
            className="relative border border-border-color bg-hover p-4 text-left cursor-zoom-in"
            aria-label={`Zoom ${name} ${index === 0 ? "front" : "back"}`}
          >
            <img
              src={image}
              alt={`${name} ${index === 0 ? "front" : "back"}`}
              className="w-full max-h-[70vh] object-contain"
            />
          </button>
        ))}
      </div>

      {zoomedImageIndex !== null && activeZoomedImage ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4 py-8"
          onClick={() => setZoomedImageIndex(null)}
        >
          <div
            className="relative w-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomedImageIndex(null)}
              className="absolute right-0 top-0 z-10 border border-white/20 bg-black/60 px-4 py-3 text-xs uppercase tracking-[0.24em] text-white backdrop-blur-sm"
            >
              Close
            </button>
            <div className="overflow-hidden border border-white/15 bg-black/40 p-4 md:p-8">
              <img
                src={activeZoomedImage}
                alt={`${name} enlarged`}
                className="max-h-[85vh] w-full object-contain"
              />
            </div>
            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={showPreviousImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 border border-white/20 bg-black/60 px-4 py-4 text-lg text-white backdrop-blur-sm"
                  aria-label="Show previous outfit image"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={showNextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 border border-white/20 bg-black/60 px-4 py-4 text-lg text-white backdrop-blur-sm"
                  aria-label="Show next outfit image"
                >
                  →
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
