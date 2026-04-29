"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function EditorialFeature({
  image,
  label,
  eyebrow,
}: {
  image?: string;
  label: string;
  eyebrow?: string;
}) {
  const cardRef = useRef<HTMLAnchorElement | null>(null);
  const [mobileActive, setMobileActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches) {
      return;
    }

    const node = cardRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setMobileActive(entry.isIntersecting);
      },
      { threshold: 0.01, rootMargin: "0px 0px -35% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="px-4 md:px-8 py-8">
      <div className="max-w-6xl mx-auto">
        {eyebrow ? (
          <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-text-secondary">
            {eyebrow}
          </p>
        ) : null}
        <Link
          href="/studio"
          ref={cardRef}
          className="relative block w-full cursor-pointer group overflow-hidden bg-surface"
        >
          {image ? (
          <img
  src={image}
  alt={label}
  className={`block w-full h-auto transition-all duration-500 ${
    mobileActive
      ? "scale-[1.03] blur-none"
      : "scale-100 blur-sm"
  } md:scale-100 md:blur-none md:group-hover:scale-[1.03] md:group-hover:blur-sm`}
/>
          ) : (
            <div className="w-full aspect-[4/5] md:aspect-[16/10] placeholder-img">
              <span className="relative z-10 text-sm tracking-widest">EDITORIAL</span>
            </div>
          )}
          <div
            className={`absolute inset-0 transition-colors duration-300 z-10 ${
              mobileActive ? "bg-foreground/30" : "bg-foreground/0 group-hover:bg-foreground/30"
            }`}
          />
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <div
              className={`text-center transition-all duration-300 ${
                mobileActive ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
              }`}
            >
              <p className="text-[11px] tracking-[0.24em] text-background uppercase">Try</p>
              <p className="mt-2 text-2xl md:text-3xl text-background uppercase">Outfit Studio</p>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}
