"use client";

import { useEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard";
import { getStoredReservationKey } from "@/lib/reservations";

interface ProductImage {
  url: string;
  isMain: boolean;
}

interface Product {
  _id: string;
  name: string;
  brand?: string;
  categories?: string[];
  colors?: string[];
  price: number;
  stock: number;
  sizeAvailability?: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null;
  cartCount?: number;
  reservedElsewhere?: boolean;
  ownedReservation?: boolean;
  blockedByOrder?: boolean;
  tag?: string;
  sizes?: string[];
  images?: ProductImage[];
  conditionScore?: number | null;
  conditionStatus?: string | null;
  productType?: "fashion" | "perfume" | "clothing" | "shoes";
  fashionSubtype?: "clothes" | "shoes" | null;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
  cloneSourceName?: string;
  cloneSourceImage?: string;
  storeType?: "thrift" | "retail" | null;
  colorImages?: Record<string, number[]> | null;
}

interface Facets {
  categories: string[];
  brands: string[];
  stores: string[];
  sizes: string[];
  colors: string[];
  priceRange: { min: number; max: number };
}

function getMainImage(images?: ProductImage[]): string | undefined {
  if (!images || images.length === 0) return undefined;
  const main = images.find((i) => i.isMain);
  return main?.url || images[0]?.url;
}

function formatCategoryLabel(value: string) {
  return value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSizeLabel(value: string) {
  const colorwayMatch = value.match(/^(.*?)(?:\s*\/\s*#?[0-9a-fA-F]{3,8})$/);
  if (colorwayMatch?.[1]) {
    return colorwayMatch[1].trim();
  }

  const separatorIndex = value.lastIndexOf(" / ");
  if (separatorIndex === -1) return value;

  return value.slice(0, separatorIndex).trim();
}

function getUniqueSizeOptions(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const label = formatSizeLabel(value);
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

export default function ProductGrid({
  category,
  initialProducts = [],
  initialTotal = 0,
  initialFacets = null,
}: {
  category?: string;
  initialProducts?: Product[];
  initialTotal?: number;
  initialFacets?: Facets | null;
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [loaded, setLoaded] = useState(initialProducts.length > 0 || initialTotal > 0 || initialFacets !== null);
  const [facets, setFacets] = useState<Facets | null>(initialFacets);

  const [queryInput, setQueryInput] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftBrand, setDraftBrand] = useState("");
  const [draftStore, setDraftStore] = useState("");
  const [draftSizes, setDraftSizes] = useState<string[]>([]);
  const [draftColor, setDraftColor] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedCategory, setAppliedCategory] = useState("");
  const [appliedBrand, setAppliedBrand] = useState("");
  const [appliedStore, setAppliedStore] = useState("");
  const [appliedSizes, setAppliedSizes] = useState<string[]>([]);
  const [appliedColor, setAppliedColor] = useState("");
  const [appliedPriceMin, setAppliedPriceMin] = useState("");
  const [appliedPriceMax, setAppliedPriceMax] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const skipNextFetch = useRef(initialProducts.length > 0 || initialFacets !== null);

  const hasActiveFilters = Boolean(
    appliedSearch ||
      appliedCategory ||
      appliedBrand ||
      appliedStore ||
      appliedSizes.length > 0 ||
      appliedColor ||
      appliedPriceMin ||
      appliedPriceMax
  );
  const hasDraftChanges =
    draftCategory !== appliedCategory ||
    draftBrand !== appliedBrand ||
    draftStore !== appliedStore ||
    draftColor !== appliedColor ||
    priceMin !== appliedPriceMin ||
    priceMax !== appliedPriceMax ||
    draftSizes.join("\u0000") !== appliedSizes.join("\u0000");
  const rangeMin = facets ? Math.floor(facets.priceRange.min) : 0;
  const rangeMax = facets ? Math.ceil(facets.priceRange.max) : 1000;
  const sliderMin = priceMin !== "" ? Number(priceMin) : rangeMin;
  const sliderMax = priceMax !== "" ? Number(priceMax) : rangeMax;
  const displaySizes = facets ? getUniqueSizeOptions(facets.sizes) : [];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedSearch(queryInput.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }

    let cancelled = false;

    const loadProducts = () => {
      const params = new URLSearchParams();
      if (appliedSearch) params.set("search", appliedSearch);
      if (category) {
        params.set("category", category);
      } else if (appliedCategory) {
        params.set("category", appliedCategory);
      }
      if (appliedBrand) params.set("brand", appliedBrand);
      if (appliedStore) params.set("store", appliedStore);
      if (appliedSizes.length > 0) params.set("size", appliedSizes.join(","));
      if (appliedColor) params.set("color", appliedColor);
      if (appliedPriceMin) params.set("priceMin", appliedPriceMin);
      if (appliedPriceMax) params.set("priceMax", appliedPriceMax);
      params.set("includeFacets", "1");
      const rk = getStoredReservationKey();
      if (rk) params.set("rk", rk);

      fetch(`/api/products?${params}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setProducts(data.products || []);
          if (data.facets) {
            setFacets({
              categories: data.facets.categories || [],
              brands: data.facets.brands || [],
              stores: data.facets.stores || [],
              sizes: data.facets.sizes || [],
              colors: data.facets.colors || [],
              priceRange: data.facets.priceRange || { min: 0, max: 0 },
            });
          }
        })
        .catch(() => {
          if (cancelled) return;
          setProducts([]);
        })
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });
    };

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, [category, appliedSearch, appliedCategory, appliedBrand, appliedStore, appliedSizes, appliedColor, appliedPriceMin, appliedPriceMax]);

  const clearFilters = () => {
    setQueryInput("");
    setDraftCategory("");
    setDraftBrand("");
    setDraftStore("");
    setDraftSizes([]);
    setDraftColor("");
    setPriceMin("");
    setPriceMax("");
    setAppliedSearch("");
    setAppliedCategory("");
    setAppliedBrand("");
    setAppliedStore("");
    setAppliedSizes([]);
    setAppliedColor("");
    setAppliedPriceMin("");
    setAppliedPriceMax("");
  };

  const toggleSize = (size: string) => {
    setDraftSizes((current) =>
      current.includes(size) ? current.filter((entry) => entry !== size) : [...current, size]
    );
  };

  const applyFilters = () => {
    setAppliedCategory(draftCategory);
    setAppliedBrand(draftBrand);
    setAppliedStore(draftStore);
    setAppliedSizes(draftSizes);
    setAppliedColor(draftColor);
    setAppliedPriceMin(priceMin);
    setAppliedPriceMax(priceMax);
  };

  if (!loaded) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[3/4] bg-border-color rounded" />
              <div className="mt-2 h-3 bg-border-color rounded w-3/4" />
              <div className="mt-1 h-3 bg-border-color rounded w-1/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0 && !hasActiveFilters) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-text-secondary">No products available in this category yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="font-sans flex items-center gap-1 cursor-pointer text-[11px] font-medium uppercase tracking-[0.14em] text-text-secondary hover:text-foreground"
        >
          Filters
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="font-sans cursor-pointer text-[11px] font-medium uppercase tracking-[0.14em] text-text-secondary underline underline-offset-2 hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      <div
        className={`grid gap-8 transition-[grid-template-columns] duration-300 ease-out lg:grid-cols-[0rem_minmax(0,1fr)] ${
          filtersOpen ? "lg:grid-cols-[16rem_minmax(0,1fr)]" : ""
        }`}
      >
        <aside
          className={`overflow-hidden transition-all duration-300 ease-out ${
            filtersOpen
              ? "mb-6 max-h-[620px] translate-x-0 opacity-100 lg:mb-0"
              : "pointer-events-none max-h-0 -translate-x-3 opacity-0 lg:max-h-none"
          }`}
          aria-hidden={!filtersOpen}
        >
          <div className="w-full space-y-4 lg:w-64">
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
                className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-text-secondary"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search shoes, jackets, hats..."
                className="font-sans h-12 w-full border-0 border-b border-border-color bg-transparent pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-text-secondary/50 focus:border-foreground"
              />
              {queryInput && (
                <button
                  type="button"
                  onClick={() => {
                    setQueryInput("");
                    setAppliedSearch("");
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-text-secondary hover:text-foreground"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {!category && facets && facets.categories.length > 0 && (
              <select
                value={draftCategory}
                onChange={(event) => setDraftCategory(event.target.value)}
                className="font-sans w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm text-foreground transition-colors focus:border-foreground focus:outline-none"
              >
                <option value="">All types</option>
                {facets.categories.map((value) => (
                  <option key={value} value={value}>
                    {formatCategoryLabel(value)}
                  </option>
                ))}
              </select>
            )}

            <select
              value={draftBrand}
              onChange={(event) => setDraftBrand(event.target.value)}
              className="font-sans w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm text-foreground transition-colors focus:border-foreground focus:outline-none"
            >
              <option value="">All brands</option>
              {facets?.brands.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            {facets && facets.stores.length > 0 && (
              <select
                value={draftStore}
                onChange={(event) => setDraftStore(event.target.value)}
                className="font-sans w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm text-foreground transition-colors focus:border-foreground focus:outline-none"
              >
                <option value="">All stores</option>
                {facets.stores.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            )}

            {displaySizes.length > 0 && (
              <div className="space-y-2">
                <p className="font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-text-secondary">Size</p>
                <div className="flex min-h-8 flex-wrap items-center gap-1.5 overflow-hidden">
                  {displaySizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => toggleSize(size)}
                      className={`font-sans px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors cursor-pointer ${
                        draftSizes.includes(size)
                          ? "bg-foreground text-background"
                          : "text-text-secondary hover:text-foreground"
                      }`}
                    >
                      {formatSizeLabel(size)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {facets && facets.colors.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-text-secondary">Colors</p>
                  <button
                    type="button"
                    onClick={() => setDraftColor("")}
                    className="font-sans text-[10px] uppercase tracking-[0.14em] text-text-secondary underline underline-offset-2 hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <div className="grid grid-cols-6 gap-2 pl-2">
                  {facets.colors.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDraftColor(value)}
                      title={value}
                      aria-label={value}
                      className={`relative h-8 w-8 border transition-all duration-200 cursor-pointer ${
                        draftColor === value
                          ? "border-foreground scale-110"
                          : "border-border-color hover:border-foreground/40"
                      }`}
                      style={{ backgroundColor: value }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-text-secondary">Price</p>
              </div>
              <div className="price-range-slider w-full">
                <div className="price-range-track">
                  <div
                    className="price-range-fill"
                    style={{
                      left: `${((sliderMin - rangeMin) / (rangeMax - rangeMin || 1)) * 100}%`,
                      width: `${((sliderMax - sliderMin) / (rangeMax - rangeMin || 1)) * 100}%`,
                    }}
                  />
                </div>
                <input
                  type="range"
                  min={rangeMin}
                  max={rangeMax}
                  value={sliderMin}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (value <= sliderMax) setPriceMin(String(value));
                  }}
                  className="price-range-thumb"
                />
                <input
                  type="range"
                  min={rangeMin}
                  max={rangeMax}
                  value={sliderMax}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (value >= sliderMin) setPriceMax(String(value));
                  }}
                  className="price-range-thumb"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-secondary">{sliderMin} TND</span>
                <span className="text-[10px] text-text-secondary">{sliderMax} TND</span>
              </div>
            </div>

            <button
              type="button"
              onClick={applyFilters}
              disabled={!hasDraftChanges}
              className="font-sans w-full border border-foreground bg-foreground px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-background transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply filters
            </button>
          </div>
        </aside>

        <section>
          {products.length === 0 && hasActiveFilters ? (
            <div className="py-16 text-center">
              <p className="text-sm text-text-secondary">No products match your filters.</p>
            </div>
          ) : (
            <div
              className={`grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-8 ${
                filtersOpen ? "lg:grid-cols-3" : "lg:grid-cols-4"
              }`}
            >
              {products.map((product) => (
                <ProductCard
                  key={product._id}
                  id={product._id}
                  name={product.name}
                  categories={product.categories}
                  price={product.price.toFixed(2)}
                  stock={product.stock}
                  sizeAvailability={product.sizeAvailability}
                  cartCount={product.cartCount}
                  reservedElsewhere={product.reservedElsewhere}
                  ownedReservation={product.ownedReservation}
                  blockedByOrder={product.blockedByOrder}
                  tag={product.tag}
                  sizes={product.sizes}
                  image={getMainImage(product.images)}
                  conditionScore={product.conditionScore}
                  conditionStatus={product.conditionStatus}
                  productType={product.productType}
                  fashionSubtype={product.fashionSubtype}
                  originPictures={product.originPictures}
                  cloneSourceName={product.cloneSourceName}
                  cloneSourceImage={product.cloneSourceImage}
                  storeType={product.storeType}
                  colorImages={product.colorImages}
                  images={product.images}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
