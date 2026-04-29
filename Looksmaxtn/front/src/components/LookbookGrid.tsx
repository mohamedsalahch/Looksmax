"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface LookbookCategory {
  _id: string;
  name: string;
  slug: string;
}

export default function LookbookGrid({
  images,
  caption,
  categories,
}: {
  images?: string[];
  caption: string;
  categories?: LookbookCategory[];
}) {
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [mobileActiveIndexes, setMobileActiveIndexes] = useState<number[]>([]);

  const safeImages = images || [];
  const displayCategories = categories || [];

  const displayItems = safeImages.map((image, index) => ({
    _id: displayCategories[index]?._id || `fallback-${index}`,
    name:
      displayCategories[index]?.name ||
      `Look ${String(index + 1).padStart(2, "0")}`,
    slug: displayCategories[index]?.slug || "all",
    image,
  }));

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 767px)").matches
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setMobileActiveIndexes((current) => {
          const next = new Set(current);

          entries.forEach((entry) => {
            const index = Number(
              (entry.target as HTMLElement).dataset.index
            );
            if (Number.isNaN(index)) return;

            if (entry.isIntersecting) {
              next.add(index);
            } else {
              next.delete(index);
            }
          });

          return Array.from(next);
        });
      },
      { threshold: 0.01, rootMargin: "0px 0px -35% 0px" }
    );

    itemRefs.current.forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [displayItems.length]);

  if (displayItems.length === 0) return null;

  return (
    <section className="px-4 md:px-8 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-center gap-1">
          {displayItems.map((item, index) => (
            <Link
              key={`${item._id}-${index}`}
              href={`/category/${item.slug}`}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              data-index={index}
              className="relative aspect-[3/4] cursor-pointer group overflow-hidden bg-surface block w-full md:w-[calc(33.333%-3px)]"
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.name}
                  className={`w-full h-full object-cover transition-all duration-500
                    ${
                      mobileActiveIndexes.includes(index)
                        ? "blur-0 scale-[1.03]"
                        : "blur-sm scale-100"
                    }
                    md:blur-0 md:scale-100 md:group-hover:blur-sm md:group-hover:scale-[1.03]
                  `}
                />
              ) : (
                <div className="w-full h-full placeholder-img">
                  <span className="relative z-10 text-[10px] tracking-widest opacity-60">
                    {item.name}
                  </span>
                </div>
              )}

              {/* Overlay */}
              <div
                className={`absolute inset-0 transition-colors duration-300 z-10 ${
                  mobileActiveIndexes.includes(index)
                    ? "bg-foreground/30"
                    : "bg-foreground/0 group-hover:bg-foreground/30"
                }`}
              />

              {/* Center text */}
              <div
                className={`absolute inset-0 z-20 flex items-center justify-center px-6 transition-all duration-300 ${
                  mobileActiveIndexes.includes(index)
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100"
                }`}
              >
                <div className="text-center text-background">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-background/70">
                    Shop
                  </p>
                  <p className="mt-3 text-xl md:text-2xl font-medium tracking-[0.12em] uppercase">
                    {item.name}
                  </p>
                </div>
              </div>

              {/* Bottom label */}
              <div
                className={`absolute inset-x-0 bottom-0 z-20 bg-background/88 px-3 py-3 backdrop-blur-sm transition-opacity duration-300 ${
                  mobileActiveIndexes.includes(index)
                    ? "opacity-0"
                    : "group-hover:opacity-0"
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">
                  Shop
                </p>
                <p className="mt-1 text-sm text-foreground">{item.name}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-right mt-2">
          <p className="text-xs text-text-secondary tracking-wider">
            {caption}
          </p>
        </div>
      </div>
    </section>
  );
}