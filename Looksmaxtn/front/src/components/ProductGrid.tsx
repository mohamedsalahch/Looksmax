"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard";
import { getStoredReservationKey } from "@/lib/reservations";
import { consumeBrowseReturnIntent, isReloadNavigation, markBrowseReturnIntent } from "@/lib/navigationState";
import {
  getColorwayEnhancedFrontImage,
  getColorwayEnhancedLeftImage,
  type ViewGender,
} from "@/lib/colorwayImage";
import type { VariantAvailabilityMap } from "@/lib/variantAvailability";

interface ProductImage {
  url: string;
  isMain: boolean;
  gender?: "men" | "women" | null;
}

/**
 * Derive the browse gender from a category slug so unisex products show the
 * matching model. Falls back to "men" when there is no gender context (e.g.
 * "all categories"), per product requirements.
 */
function deriveViewGender(category?: string): ViewGender {
  if (category === "women" || category?.endsWith("-women")) return "women";
  return "men";
}

type ProductVariant = {
  _id: string;
  size: string;
  color: string | null;
  stock?: number;
  fullStock?: number;
  conditionScore?: number | null;
  images?: number[];
};

interface Product {
  _id: string;
  name: string;
  brand?: string;
  categories?: string[];
  colors?: string[];
  price: number;
  stock: number;
  variants?: ProductVariant[];
  variantAvailability?: VariantAvailabilityMap | null;
  cartCount?: number;
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
  gender?: "men" | "women" | "children" | "unisex" | null;
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

function getCollectionCardImage(product: Product, viewGender: ViewGender): string | undefined {
  if (product.fashionSubtype === "shoes") {
    const enhancedLeft = getColorwayEnhancedLeftImage(
      null,
      { images: product.images, variants: product.variants },
      "",
      viewGender
    );
    if (enhancedLeft) {
      return enhancedLeft;
    }
  }

  // Unisex products carry per-gender model pictures; pick the one for this view.
  if (product.gender === "unisex") {
    const genderedFront = getColorwayEnhancedFrontImage(
      null,
      { images: product.images, variants: product.variants },
      "",
      viewGender
    );
    if (genderedFront) {
      return genderedFront;
    }
  }

  return getMainImage(product.images);
}

function formatCategoryLabel(value: string) {
  return value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getUniqueSizeOptions(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return false;
    seen.add(trimmed);
    return true;
  });
}

const PAGE_SIZE = 24;
const BROWSE_CACHE_PREFIX = "looksmax:browse-grid:";
const BROWSE_CACHE_MAX_AGE = 30 * 60 * 1000;

interface BrowseGridCache {
  timestamp: number;
  products: Product[];
  facets: Facets | null;
  total: number;
  page: number;
  scrollY: number;
  anchorProductId?: string;
  anchorViewportTop?: number;
  filters?: BrowseGridFilters;
}

interface BrowseGridFilters {
  queryInput: string;
  draftCategory: string;
  draftBrand: string;
  draftStore: string;
  draftSizes: string[];
  draftColor: string;
  priceMin: string;
  priceMax: string;
  appliedSearch: string;
  appliedCategory: string;
  appliedBrand: string;
  appliedStore: string;
  appliedSizes: string[];
  appliedColor: string;
  appliedPriceMin: string;
  appliedPriceMax: string;
  filtersOpen: boolean;
}

function getBrowseCacheKey(category?: string, storeName = "") {
  if (typeof window === "undefined") return "";
  return `${BROWSE_CACHE_PREFIX}${window.location.pathname}${window.location.search}:category=${category || ""}:store=${storeName}`;
}

function readBrowseCache(category?: string, storeName = ""): BrowseGridCache | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(getBrowseCacheKey(category, storeName));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrowseGridCache;
    if (!parsed.timestamp || Date.now() - parsed.timestamp > BROWSE_CACHE_MAX_AGE) return null;
    if (!Array.isArray(parsed.products)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getBrowseProductElement(productId: string) {
  if (typeof document === "undefined") return null;
  const nodes = document.querySelectorAll<HTMLElement>("[data-browse-product-id]");
  return Array.from(nodes).find((node) => node.dataset.browseProductId === productId) || null;
}

export default function ProductGrid({
  category,
  storeName = "",
  initialProducts = [],
  initialFacets = null,
  initialTotal,
}: {
  category?: string;
  storeName?: string;
  initialProducts?: Product[];
  initialFacets?: Facets | null;
  initialTotal?: number;
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [loaded, setLoaded] = useState(initialProducts.length > 0 || initialFacets !== null);
  const [facets, setFacets] = useState<Facets | null>(initialFacets);
  const [total, setTotal] = useState(initialTotal ?? initialProducts.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const filterGenerationRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const restoredScrollRef = useRef(false);
  const skipRestoredFilterFetchRef = useRef(false);
  const pendingRestoreRef = useRef<{
    scrollY: number;
    anchorProductId?: string;
    anchorViewportTop?: number;
    productCount: number;
  } | null>(null);
  const scrollRetryRef = useRef<{
    frames: number[];
    timeouts: number[];
    resizeObserver?: ResizeObserver;
  } | null>(null);
  const scrollRestoreActiveRef = useRef(false);

  const [queryInput, setQueryInput] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftBrand, setDraftBrand] = useState("");
  const [draftStore, setDraftStore] = useState(storeName);
  const [draftSizes, setDraftSizes] = useState<string[]>([]);
  const [draftColor, setDraftColor] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedCategory, setAppliedCategory] = useState("");
  const [appliedBrand, setAppliedBrand] = useState("");
  const [appliedStore, setAppliedStore] = useState(storeName);
  const [appliedSizes, setAppliedSizes] = useState<string[]>([]);
  const [appliedColor, setAppliedColor] = useState("");
  const [appliedPriceMin, setAppliedPriceMin] = useState("");
  const [appliedPriceMax, setAppliedPriceMax] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const skipNextFetch = useRef(initialProducts.length > 0 || initialFacets !== null);

  useLayoutEffect(() => {
    if (isReloadNavigation()) {
      restoredScrollRef.current = true;
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    const cacheKey = getBrowseCacheKey(category, storeName);
    if (!consumeBrowseReturnIntent(cacheKey)) return;

    const cached = readBrowseCache(category, storeName);
    if (!cached || cached.products.length === 0) return;

    setProducts(cached.products);
    setFacets(cached.facets);
    setTotal(cached.total);
    setLoaded(true);
    pageRef.current = Math.max(1, cached.page || 1);

    if (cached.filters) {
      skipRestoredFilterFetchRef.current = true;
      setQueryInput(cached.filters.queryInput);
      setDraftCategory(cached.filters.draftCategory);
      setDraftBrand(cached.filters.draftBrand);
      setDraftStore(cached.filters.draftStore || storeName);
      setDraftSizes(cached.filters.draftSizes);
      setDraftColor(cached.filters.draftColor);
      setPriceMin(cached.filters.priceMin);
      setPriceMax(cached.filters.priceMax);
      setAppliedSearch(cached.filters.appliedSearch);
      setAppliedCategory(cached.filters.appliedCategory);
      setAppliedBrand(cached.filters.appliedBrand);
      setAppliedStore(cached.filters.appliedStore || storeName);
      setAppliedSizes(cached.filters.appliedSizes);
      setAppliedColor(cached.filters.appliedColor);
      setAppliedPriceMin(cached.filters.appliedPriceMin);
      setAppliedPriceMax(cached.filters.appliedPriceMax);
      setFiltersOpen(cached.filters.filtersOpen);
    }

    if (!restoredScrollRef.current) {
      restoredScrollRef.current = true;
      pendingRestoreRef.current = {
        scrollY: cached.scrollY,
        anchorProductId: cached.anchorProductId,
        anchorViewportTop: cached.anchorViewportTop,
        productCount: cached.products.length,
      };
    }
  }, [category, storeName]);

  const cancelScrollRetries = useCallback(() => {
    if (!scrollRetryRef.current) return;
    scrollRetryRef.current.frames.forEach((id) => window.cancelAnimationFrame(id));
    scrollRetryRef.current.timeouts.forEach((id) => window.clearTimeout(id));
    scrollRetryRef.current.resizeObserver?.disconnect();
    scrollRetryRef.current = null;
    scrollRestoreActiveRef.current = false;
  }, []);

  // Cancel scroll retries on unmount only — not on every products change.
  useEffect(() => {
    return cancelScrollRetries;
  }, [cancelScrollRetries]);

  useLayoutEffect(() => {
    const pending = pendingRestoreRef.current;
    if (!pending) return;
    if (pending.anchorProductId && !products.some((product) => product._id === pending.anchorProductId)) return;
    if (!pending.anchorProductId && products.length < pending.productCount) return;

    pendingRestoreRef.current = null;

    // Cancel any previous retry attempt before starting a new one.
    cancelScrollRetries();
    scrollRestoreActiveRef.current = true;

    const restoreScroll = () => {
      if (pending.anchorProductId) {
        const anchor = getBrowseProductElement(pending.anchorProductId);
        if (anchor) {
          const targetViewportTop =
            typeof pending.anchorViewportTop === "number"
              ? pending.anchorViewportTop
              : Math.max(0, window.innerHeight / 2 - anchor.getBoundingClientRect().height / 2);
          const nextScrollY = Math.max(
            0,
            window.scrollY + anchor.getBoundingClientRect().top - targetViewportTop,
          );
          window.scrollTo({ top: nextScrollY, behavior: "auto" });
          return;
        }
      }

      window.scrollTo({ top: pending.scrollY, behavior: "auto" });
    };

    // First attempt uses saved scrollY directly — images may not be loaded yet so
    // anchor-based calculation would be wrong (collapsed page too short).
    window.scrollTo({ top: pending.scrollY, behavior: "auto" });

    const frames = [
      window.requestAnimationFrame(restoreScroll),
      window.requestAnimationFrame(() => window.requestAnimationFrame(restoreScroll)),
    ];
    const retryDelays = [120, 360, 800, 1400, 2200, 3400];
    const timeouts = retryDelays.map((delay) => window.setTimeout(restoreScroll, delay));
    let resizeObserver: ResizeObserver | undefined;

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        window.requestAnimationFrame(restoreScroll);
      });
      resizeObserver.observe(document.body);
    }

    timeouts.push(window.setTimeout(() => {
      scrollRestoreActiveRef.current = false;
      resizeObserver?.disconnect();
    }, retryDelays[retryDelays.length - 1] + 100));

    // Store IDs in a ref so they survive loadMore firing and are only cancelled on unmount.
    scrollRetryRef.current = { frames, timeouts, resizeObserver };
  }, [cancelScrollRetries, products]);

  const saveBrowsePosition = useCallback((anchorProductId?: string) => {
    if (typeof window === "undefined") return;

    try {
      const anchor = anchorProductId ? getBrowseProductElement(anchorProductId) : null;
      const anchorViewportTop = anchor?.getBoundingClientRect().top;
      const payload: BrowseGridCache = {
        timestamp: Date.now(),
        products,
        facets,
        total,
        page: pageRef.current,
        scrollY: window.scrollY,
        anchorProductId,
        anchorViewportTop,
        filters: {
          queryInput,
          draftCategory,
          draftBrand,
          draftStore,
          draftSizes,
          draftColor,
          priceMin,
          priceMax,
          appliedSearch,
          appliedCategory,
          appliedBrand,
          appliedStore,
          appliedSizes,
          appliedColor,
          appliedPriceMin,
          appliedPriceMax,
          filtersOpen,
        },
      };
      const cacheKey = getBrowseCacheKey(category, storeName);
      window.sessionStorage.setItem(cacheKey, JSON.stringify(payload));
      markBrowseReturnIntent(cacheKey);
    } catch {
      // Ignore storage failures so product navigation never gets blocked.
    }
  }, [
    appliedBrand,
    appliedCategory,
    appliedColor,
    appliedPriceMax,
    appliedPriceMin,
    appliedSearch,
    appliedSizes,
    appliedStore,
    category,
    draftBrand,
    draftCategory,
    draftColor,
    draftSizes,
    draftStore,
    facets,
    filtersOpen,
    priceMax,
    priceMin,
    products,
    queryInput,
    storeName,
    total,
  ]);

  const hasActiveFilters = Boolean(
    appliedSearch ||
      appliedCategory ||
      appliedBrand ||
      (!storeName && appliedStore) ||
      appliedSizes.length > 0 ||
      appliedColor ||
      appliedPriceMin ||
      appliedPriceMax
  );
  const hasDraftChanges =
    draftCategory !== appliedCategory ||
    draftBrand !== appliedBrand ||
    (!storeName && draftStore !== appliedStore) ||
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

  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set("search", appliedSearch);
    if (category) {
      params.set("category", category);
    } else if (appliedCategory) {
      params.set("category", appliedCategory);
    }
    if (appliedBrand) params.set("brand", appliedBrand);
    if (storeName) params.set("store", storeName);
    else if (appliedStore) params.set("store", appliedStore);
    if (appliedSizes.length > 0) params.set("size", appliedSizes.join(","));
    if (appliedColor) params.set("color", appliedColor);
    if (appliedPriceMin) params.set("priceMin", appliedPriceMin);
    if (appliedPriceMax) params.set("priceMax", appliedPriceMax);
    params.set("limit", String(PAGE_SIZE));
    const rk = getStoredReservationKey();
    if (rk) params.set("rk", rk);
    return params;
  };
  const buildFilterParamsRef = useRef(buildFilterParams);
  useEffect(() => {
    buildFilterParamsRef.current = buildFilterParams;
  });

  useEffect(() => {
    if (skipRestoredFilterFetchRef.current) {
      skipRestoredFilterFetchRef.current = false;
      return;
    }

    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }

    let cancelled = false;
    // A new filter generation invalidates any in-flight "load more" append.
    filterGenerationRef.current += 1;

    const loadProducts = () => {
      const params = buildFilterParamsRef.current();
      params.set("page", "1");
      params.set("includeFacets", "1");

      fetch(`/api/products?${params}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setProducts(data.products || []);
          setTotal(typeof data.total === "number" ? data.total : (data.products || []).length);
          pageRef.current = 1;
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
          setTotal(0);
          pageRef.current = 1;
        })
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });
    };

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, [category, storeName, appliedSearch, appliedCategory, appliedBrand, appliedStore, appliedSizes, appliedColor, appliedPriceMin, appliedPriceMax]);

  const hasMore = products.length < total;

  const loadMore = () => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    const generation = filterGenerationRef.current;
    const nextPage = pageRef.current + 1;
    const params = buildFilterParamsRef.current();
    params.set("page", String(nextPage));

    fetch(`/api/products?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (filterGenerationRef.current !== generation) return;
        const nextProducts: Product[] = data.products || [];
        setProducts((current) => {
          const seen = new Set(current.map((product) => product._id));
          return [...current, ...nextProducts.filter((product) => !seen.has(product._id))];
        });
        if (typeof data.total === "number") setTotal(data.total);
        pageRef.current = nextPage;
      })
      .catch(() => {})
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  };
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  // Infinite scroll: append the next server page when the sentinel nears the
  // viewport, instead of fetching whole categories upfront.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          if (scrollRestoreActiveRef.current) return;
          loadMoreRef.current();
        }
      },
      { rootMargin: "600px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loaded]);

  const clearFilters = () => {
    setQueryInput("");
    setDraftCategory("");
    setDraftBrand("");
    setDraftStore(storeName);
    setDraftSizes([]);
    setDraftColor("");
    setPriceMin("");
    setPriceMax("");
    setAppliedSearch("");
    setAppliedCategory("");
    setAppliedBrand("");
    setAppliedStore(storeName);
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
    setAppliedStore(storeName || draftStore);
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

            {!storeName && facets && facets.stores.length > 0 && (
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
                      {size}
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
                  {facets.colors.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setDraftColor(hex)}
                      title={hex}
                      aria-label={hex}
                      className={`relative h-8 w-8 border transition-all duration-200 cursor-pointer ${
                        draftColor.toLowerCase() === hex.toLowerCase()
                          ? "border-foreground scale-110"
                          : "border-border-color hover:border-foreground/40"
                      }`}
                      style={{ backgroundColor: hex }}
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
              {products.map((product, index) => (
                <ProductCard
	                  key={product._id}
	                  id={product._id}
	                  onProductNavigate={() => saveBrowsePosition(product._id)}
	                  browseProductId={product._id}
                  imagePriority={index < 4}
                  name={product.name}
                  categories={product.categories}
                  price={product.price.toFixed(2)}
                  stock={product.stock}
                  variants={product.variants}
                  variantAvailability={product.variantAvailability}
                  cartCount={product.cartCount}
                  ownedReservation={product.ownedReservation}
                  blockedByOrder={product.blockedByOrder}
                  tag={product.tag}
                  conditionScore={product.conditionScore}
                  conditionStatus={product.conditionStatus}
                  productType={product.productType}
                  fashionSubtype={product.fashionSubtype}
                  originPictures={product.originPictures}
                  cloneSourceName={product.cloneSourceName}
                  cloneSourceImage={product.cloneSourceImage}
                  storeType={product.storeType}
                  images={product.images}
                  viewGender={deriveViewGender(category)}
                  image={getCollectionCardImage(product, deriveViewGender(category))}
                  preferCollectionLeftImage
                />
              ))}
            </div>
          )}
          {hasMore && (
            <div ref={sentinelRef} className="py-8">
              {loadingMore && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="aspect-[3/4] bg-border-color rounded" />
                      <div className="mt-2 h-3 bg-border-color rounded w-3/4" />
                      <div className="mt-1 h-3 bg-border-color rounded w-1/4" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
