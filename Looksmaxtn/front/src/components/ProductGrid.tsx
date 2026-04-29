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
  categories?: string[];
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
}

interface Facets {
  sizes: string[];
  priceRange: { min: number; max: number };
}

function getMainImage(images?: ProductImage[]): string | undefined {
  if (!images || images.length === 0) return undefined;
  const main = images.find((i) => i.isMain);
  return main?.url || images[0]?.url;
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

  const [selectedSize, setSelectedSize] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const skipNextFetch = useRef(initialProducts.length > 0 || initialFacets !== null);

  const hasActiveFilters = selectedSize || priceMin || priceMax;
  const rangeMin = facets ? Math.floor(facets.priceRange.min) : 0;
  const rangeMax = facets ? Math.ceil(facets.priceRange.max) : 1000;
  const sliderMin = priceMin !== "" ? Number(priceMin) : rangeMin;
  const sliderMax = priceMax !== "" ? Number(priceMax) : rangeMax;

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }

    let cancelled = false;

    const loadProducts = () => {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (selectedSize) params.set("size", selectedSize);
      if (priceMin) params.set("priceMin", priceMin);
      if (priceMax) params.set("priceMax", priceMax);
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
              sizes: data.facets.sizes || [],
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
  }, [category, selectedSize, priceMin, priceMax]);

  const clearFilters = () => {
    setSelectedSize("");
    setPriceMin("");
    setPriceMax("");
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
          className="text-[10px] uppercase tracking-wider text-text-secondary hover:text-foreground cursor-pointer flex items-center gap-1"
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
            className="text-[10px] uppercase tracking-wider text-text-secondary hover:text-foreground underline underline-offset-2 cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          filtersOpen ? "max-h-[300px] opacity-100 mb-4" : "max-h-0 opacity-0"
        }`}
      >
        <div className="p-4 space-y-4">
          {facets && facets.sizes.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-text-secondary">Size</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {facets.sizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(selectedSize === size ? "" : size)}
                    className={`px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
                      selectedSize === size
                        ? "bg-foreground text-background"
                        : "text-text-secondary hover:text-foreground"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-text-secondary">Price</p>
            </div>
            <div className="price-range-slider w-full max-w-[240px]">
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
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val <= sliderMax) setPriceMin(String(val));
                }}
                className="price-range-thumb"
              />
              <input
                type="range"
                min={rangeMin}
                max={rangeMax}
                value={sliderMax}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= sliderMin) setPriceMax(String(val));
                }}
                className="price-range-thumb"
              />
            </div>
            <div className="flex w-full max-w-[240px] items-center justify-between">
              <span className="text-[10px] text-text-secondary">{sliderMin} TND</span>
              <span className="text-[10px] text-text-secondary">{sliderMax} TND</span>
            </div>
          </div>
        </div>
      </div>

      {products.length === 0 && hasActiveFilters ? (
        <div className="py-16 text-center">
          <p className="text-sm text-text-secondary">No products match your filters.</p>
        </div>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8">
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
          />
        ))}
      </div>
      )}
    </div>
  );
}
