"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatTndPrice } from "@/lib/formatPrice";

type SuggestionProduct = {
  _id: string;
  name: string;
  price: number;
  brand?: string;
  categories?: string[];
  images?: { url: string; isMain: boolean }[];
};

function getMainImage(images?: { url: string; isMain: boolean }[]) {
  if (!images || images.length === 0) return "";
  return images.find((image) => image.isMain)?.url || images[0]?.url || "";
}

export default function HeaderSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionProduct[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || debouncedQuery.length < 2) {
      return;
    }

    let cancelled = false;

    fetch(`/api/products?search=${encodeURIComponent(debouncedQuery)}&limit=6`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setSuggestions(Array.isArray(data.products) ? data.products : []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  const showDropdown = open && debouncedQuery.length >= 2;
  const resultLabel = useMemo(() => debouncedQuery || query.trim(), [debouncedQuery, query]);

  const goToSearch = () => {
    const nextQuery = query.trim();
    if (!nextQuery) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(nextQuery)}`);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => router.push("/search")}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-foreground hover:text-text-secondary transition-colors cursor-pointer"
        aria-label="Search"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </button>

      {open && (
        <div className="fixed left-3 right-3 top-[62px] z-50 border border-border-color bg-background p-3 shadow-[0_20px_60px_rgba(0,0,0,0.12)] md:absolute md:right-0 md:left-auto md:top-full md:mt-3 md:w-[min(32rem,calc(100vw-2rem))] md:p-4">
          <div className="relative">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                setLoading(nextQuery.trim().length >= 2);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  goToSearch();
                }
              }}
              placeholder="Search shoes, jackets, hats..."
              className="h-12 w-full rounded-full border border-border-color bg-background pl-11 pr-11 text-sm text-foreground outline-none transition-all focus:border-foreground focus:shadow-[0_0_0_3px_rgba(0,0,0,0.05)] md:h-14 md:pl-12 md:pr-12"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSuggestions([]);
                  inputRef.current?.focus();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {showDropdown && (
            <div className="mt-3 border border-border-color bg-background">
              {loading ? (
                <div className="px-4 py-4 text-xs uppercase tracking-[0.18em] text-text-secondary">
                  Searching...
                </div>
              ) : (
                <>
                  {suggestions.map((product) => (
                    <Link
                      key={product._id}
                      href={`/product/${product._id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 border-b border-border-color px-4 py-3 transition-colors hover:bg-hover last:border-b-0"
                    >
                      <div className="h-14 w-12 shrink-0 overflow-hidden bg-surface">
                        {getMainImage(product.images) ? (
                          <img
                            src={getMainImage(product.images)}
                            alt={product.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {formatTndPrice(product.price)} · {product.brand || product.categories?.[0] || "LOOKSMAX"}
                        </p>
                      </div>
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={goToSearch}
                    className="w-full px-4 py-3 text-left text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-hover"
                  >
                    See all results for “{resultLabel}”
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
