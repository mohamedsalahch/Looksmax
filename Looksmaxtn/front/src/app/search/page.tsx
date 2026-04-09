"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ProductCard from "@/components/ProductCard";

type ProductImage = {
  url: string;
  isMain: boolean;
};

type Product = {
  _id: string;
  name: string;
  price: number;
  stock: number;
  brand?: string;
  categories?: string[];
  sizes?: string[];
  colors?: string[];
  images?: ProductImage[];
  reservationExpiresAt?: string | null;
  tag?: string;
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
};

type Facets = {
  categories: string[];
  brands: string[];
  sizes: string[];
  colors: string[];
  priceRange: { min: number; max: number };
};

function getMainImage(images?: ProductImage[]) {
  if (!images || images.length === 0) return undefined;
  return images.find((image) => image.isMain)?.url || images[0]?.url;
}

function SearchContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [queryInput, setQueryInput] = useState(searchParams.get("q") || "");
  const [products, setProducts] = useState<Product[]>([]);
  const [facets, setFacets] = useState<Facets>({
    categories: [],
    brands: [],
    sizes: [],
    colors: [],
    priceRange: { min: 0, max: 0 },
  });
  const [loading, setLoading] = useState(true);

  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const brand = searchParams.get("brand") || "";
  const size = searchParams.get("size") || "";
  const color = searchParams.get("color") || "";
  const availability = searchParams.get("availability") || "";
  const priceMin = searchParams.get("priceMin") || "";
  const priceMax = searchParams.get("priceMax") || "";

  useEffect(() => {
    setQueryInput(q);
  }, [q]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (category) params.set("category", category);
    if (brand) params.set("brand", brand);
    if (size) params.set("size", size);
    if (color) params.set("color", color);
    if (availability) params.set("availability", availability);
    if (priceMin) params.set("priceMin", priceMin);
    if (priceMax) params.set("priceMax", priceMax);
    params.set("includeFacets", "1");
    params.set("limit", "24");

    let cancelled = false;
    setLoading(true);

    fetch(`/api/products?${params}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setFacets(
          data.facets || {
            categories: [],
            brands: [],
            sizes: [],
            colors: [],
            priceRange: { min: 0, max: 0 },
          }
        );
      })
      .catch(() => {
        if (cancelled) return;
        setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [q, category, brand, size, color, availability, priceMin, priceMax]);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const clearFilters = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const hasFilters = useMemo(
    () => Boolean(category || brand || size || color || availability || priceMin || priceMax),
    [availability, brand, category, color, priceMax, priceMin, size]
  );

  return (
    <div className="pt-[57px]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="max-w-3xl">
          <p className="text-[10px] uppercase tracking-[0.26em] text-text-secondary">Search</p>
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              updateParam("q", queryInput.trim());
            }}
          >
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
                type="text"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search shoes, jackets, hats..."
                className="h-14 w-full rounded-full border border-border-color bg-background pl-12 pr-12 text-sm text-foreground outline-none transition-all focus:border-foreground focus:shadow-[0_0_0_3px_rgba(0,0,0,0.05)]"
              />
              {queryInput && (
                <button
                  type="button"
                  onClick={() => {
                    setQueryInput("");
                    updateParam("q", "");
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary hover:text-foreground"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">Filters</p>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[10px] uppercase tracking-[0.22em] text-foreground underline underline-offset-4"
                >
                  Clear
                </button>
              )}
            </div>

            <select
              value={category}
              onChange={(event) => updateParam("category", event.target.value)}
              className="w-full border border-border-color bg-background px-4 py-3 text-sm"
            >
              <option value="">All categories</option>
              {facets.categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            <select
              value={brand}
              onChange={(event) => updateParam("brand", event.target.value)}
              className="w-full border border-border-color bg-background px-4 py-3 text-sm"
            >
              <option value="">All brands</option>
              {facets.brands.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            <select
              value={size}
              onChange={(event) => updateParam("size", event.target.value)}
              className="w-full border border-border-color bg-background px-4 py-3 text-sm"
            >
              <option value="">All sizes</option>
              {facets.sizes.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            <select
              value={color}
              onChange={(event) => updateParam("color", event.target.value)}
              className="w-full border border-border-color bg-background px-4 py-3 text-sm"
            >
              <option value="">All colors</option>
              {facets.colors.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            <select
              value={availability}
              onChange={(event) => updateParam("availability", event.target.value)}
              className="w-full border border-border-color bg-background px-4 py-3 text-sm"
            >
              <option value="">All availability</option>
              <option value="in-stock">In stock</option>
              <option value="out-of-stock">Out of stock</option>
            </select>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min="0"
                value={priceMin}
                onChange={(event) => updateParam("priceMin", event.target.value)}
                placeholder={`Min ${facets.priceRange.min || 0}`}
                className="w-full border border-border-color bg-background px-4 py-3 text-sm"
              />
              <input
                type="number"
                min="0"
                value={priceMax}
                onChange={(event) => updateParam("priceMax", event.target.value)}
                placeholder={`Max ${facets.priceRange.max || 0}`}
                className="w-full border border-border-color bg-background px-4 py-3 text-sm"
              />
            </div>
          </aside>

          <section>
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h1 className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
                  {q ? `Results for “${q}”` : "All results"}
                </h1>
                <p className="mt-2 text-xs text-text-secondary">
                  Refine by category, size, color, price, brand, or availability.
                </p>
              </div>
              {!loading && (
                <p className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">
                  {products.length} result{products.length === 1 ? "" : "s"}
                </p>
              )}
            </div>

            {loading ? (
              <p className="text-xs text-text-secondary animate-pulse">Loading results...</p>
            ) : products.length === 0 ? (
              <div className="border border-border-color border-dashed px-6 py-12 text-center text-sm text-text-secondary">
                No products match this search yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <ProductCard
                    key={product._id}
                    id={product._id}
                    name={product.name}
                    categories={product.categories}
                    price={product.price.toFixed(2)}
                    stock={product.stock}
                    reservationExpiresAt={product.reservationExpiresAt}
                    tag={product.tag}
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
          </section>
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="pt-32 text-center text-xs animate-pulse">Loading search...</div>}>
      <SearchContent />
    </Suspense>
  );
}
