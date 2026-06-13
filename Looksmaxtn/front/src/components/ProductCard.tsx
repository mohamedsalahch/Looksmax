"use client";

import Link from "next/link";
import NextImage from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/providers/CartContext";
import MediaRenderer from "@/components/MediaRenderer";
import { reserveProduct } from "@/lib/reservations";
import { subscribeToAvailabilityStream } from "@/lib/availabilityStream";
import { formatTndPrice } from "@/lib/formatPrice";
import { isOptimizableImageSrc } from "@/lib/imageOptimization";
import { getConditionColor, getConditionLabel, getConditionPercent } from "@/lib/productCondition";
import { queueStudioAssignment } from "@/lib/studioAssignment";
import { getColorwayEnhancedFrontImage, getColorwayEnhancedLeftImage, getColorwayMainImage } from "@/lib/colorwayImage";
import type { VariantAvailabilityMap } from "@/lib/variantAvailability";

type ProductType = "fashion" | "perfume" | "clothing" | "shoes";

type ProductVariant = {
  _id: string;
  size: string;
  color: string | null;
  stock?: number;
  fullStock?: number;
  conditionScore?: number | null;
  images?: number[];
};

interface ProductCardProps {
  id: string;
  name: string;
  brand?: string;
  categories?: string[];
  price: string;
  tag?: string;
  image?: string;
  stock?: number;
  cartCount?: number;
  ownedReservation?: boolean;
  blockedByOrder?: boolean;
  conditionScore?: number | null;
  conditionStatus?: string | null;
  productType?: ProductType;
  fashionSubtype?: "clothes" | "shoes" | null;
  variants?: ProductVariant[];
  variantAvailability?: VariantAvailabilityMap | null;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
  cloneSourceName?: string;
  cloneSourceImage?: string;
  storeType?: "thrift" | "retail" | null;
  images?: { url: string; isMain: boolean; gender?: "men" | "women" | null }[];
  preferCollectionLeftImage?: boolean;
  /** Browse gender context — picks the male/female model for unisex products. */
  viewGender?: "men" | "women" | null;
  /** Set for above-the-fold cards so their image preloads; the rest lazy-load. */
  imagePriority?: boolean;
  onProductNavigate?: () => void;
  browseProductId?: string;
}

const CLONE_PREVIEW_WIDTH = 184;
const CLONE_PREVIEW_HEIGHT = 240;
const CLONE_PREVIEW_OFFSET = 24;
const PRODUCT_DETAIL_IMAGE_PRELOAD_LIMIT = 8;
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"];
const preloadedProductImageGroups = new Set<string>();

function isVideoUrl(url: string) {
  const normalized = url.split("?")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function ProductDetailImagePrefetcher({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
      {urls.map((url) => (
        <NextImage
          key={url}
          src={url}
          alt=""
          width={0}
          height={0}
          sizes="(min-width: 768px) 50vw, 100vw"
          className="h-px w-px object-contain"
          loading="eager"
          unoptimized={!isOptimizableImageSrc(url)}
        />
      ))}
    </div>
  );
}

export default function ProductCard({
  id,
  name,
  brand = "",
  categories = [],
  price,
  tag,
  image,
  stock = 1,
  blockedByOrder: initialBlockedByOrder = false,
  conditionScore = null,
  conditionStatus = null,
  productType = "fashion",
  fashionSubtype = "clothes",
  variants = [],
  variantAvailability,
  originPictures,
  cloneSourceName = "",
  cloneSourceImage = "",
  storeType,
  images = [],
  preferCollectionLeftImage = false,
  viewGender = null,
  imagePriority = false,
  onProductNavigate,
  browseProductId,
}: ProductCardProps) {
  const { addItem, hydrated: cartHydrated } = useCart();
  const router = useRouter();
  const cardRef = useRef<HTMLAnchorElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [shouldPreloadDetails, setShouldPreloadDetails] = useState(false);
  const [variantAvailabilityState, setVariantAvailabilityState] = useState<VariantAvailabilityMap | null>(
    variantAvailability || null,
  );
  const isPerfume = productType === "perfume";

  const colorwayColors = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const variant of variants) {
      const hex = variant.color?.toLowerCase();
      if (hex && !seen.has(hex)) {
        seen.add(hex);
        result.push(hex);
      }
    }
    return result;
  }, [variants]);

  const defaultSelectableVariant = useMemo(() => {
    if (isPerfume || variants.length === 0) return null;
    const available = variants.find(
      (variant) => (variantAvailabilityState?.[variant._id]?.stock ?? variant.stock ?? 0) > 0,
    );
    return available || variants[0] || null;
  }, [isPerfume, variantAvailabilityState, variants]);

  const [activeColorHex, setActiveColorHex] = useState<string | null>(
    defaultSelectableVariant?.color || colorwayColors[0] || null,
  );

  const productMainImage = images.find((productImage) => productImage.isMain)?.url || images[0]?.url || image || "";
  const selectedCartImage = getColorwayMainImage(activeColorHex, { image: productMainImage, images, variants }, productMainImage, viewGender);
  const selectedStoreImage = getColorwayEnhancedFrontImage(activeColorHex, { image, images, variants }, image, viewGender);
  const selectedCollectionImage = preferCollectionLeftImage && fashionSubtype === "shoes"
    ? getColorwayEnhancedLeftImage(activeColorHex, { image, images, variants }, image, viewGender)
    : "";
  const displayImage = selectedCollectionImage || selectedCartImage || image;
  const normalizedConditionScore = conditionScore ?? 0;

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [clonePreview, setClonePreview] = useState({ visible: false, x: 0, y: 0 });
  const [blockedByOrder, setBlockedByOrder] = useState(initialBlockedByOrder);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasCondition = colorwayColors.length === 0 && conditionScore != null;
  const conditionPercent = hasCondition ? getConditionPercent(normalizedConditionScore) : 0;
  const conditionLabel = hasCondition ? getConditionLabel(normalizedConditionScore, conditionStatus ?? undefined) : "";
  const conditionColor = hasCondition ? getConditionColor(normalizedConditionScore) : "transparent";
  const hasExplicitNewTag = tag?.trim().toUpperCase() === "NEW";
  const showNewBadge = !hasExplicitNewTag && !isPerfume && hasCondition && normalizedConditionScore >= 10;

  const variantsForActiveColor = useMemo(() => {
    if (isPerfume) return [];
    if (!activeColorHex || colorwayColors.length === 0) return variants;
    return variants.filter(
      (variant) => variant.color?.toLowerCase() === activeColorHex.toLowerCase(),
    );
  }, [activeColorHex, colorwayColors.length, isPerfume, variants]);

  const sizedVariants = variantsForActiveColor.filter((variant) => Boolean(variant.size.trim()));
  const hasSizes = !isPerfume && sizedVariants.length > 0;

  const defaultSelectableVariantForColor = (() => {
    if (variantsForActiveColor.length === 0) return null;
    const available = variantsForActiveColor.find(
      (variant) => (variantAvailabilityState?.[variant._id]?.stock ?? variant.stock ?? 0) > 0,
    );
    return available || variantsForActiveColor[0];
  })();

  const [selectedVariantId, setSelectedVariantId] = useState<string>(defaultSelectableVariant?._id || "");
  const selectedVariant = selectedVariantId
    ? variants.find((variant) => variant._id === selectedVariantId)
    : undefined;
  const selectedVariantAvailability = !isPerfume && selectedVariantId
    ? variantAvailabilityState?.[selectedVariantId]
    : null;
  const selectedVariantStock = (() => {
    if (!isPerfume && selectedVariantAvailability) return selectedVariantAvailability.stock;
    if (!isPerfume && selectedVariant) return selectedVariant.stock ?? stock;
    return stock;
  })();
  const isSoldOut = !isPerfume && selectedVariantAvailability
    ? selectedVariantAvailability.stock <= 0
    : false;
  const isBlocked = !isPerfume && selectedVariantStock <= 0;
  const statusLabel = "Sold Out";
  const cardHref = !isPerfume && isMounted && selectedVariant?.size
    ? {
        pathname: `/product/${id}`,
        query: { size: selectedVariant.size, color: activeColorHex || undefined, g: viewGender || undefined },
      }
    : viewGender
      ? { pathname: `/product/${id}`, query: { g: viewGender } }
      : `/product/${id}`;
  const detailImagePreloadUrls = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    const candidates = [
      displayImage,
      ...images.map((productImage) => productImage.url),
    ];

    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate) || isVideoUrl(candidate)) continue;
      seen.add(candidate);
      result.push(candidate);
      if (result.length >= PRODUCT_DETAIL_IMAGE_PRELOAD_LIMIT) break;
    }

    return result;
  }, [displayImage, images]);
  const detailImagePreloadKey = `${id}:${detailImagePreloadUrls.join("|")}`;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof window === "undefined") return;

    const runPrefetch = () => {
      if (detailImagePreloadUrls.length > 0 && !preloadedProductImageGroups.has(detailImagePreloadKey)) {
        preloadedProductImageGroups.add(detailImagePreloadKey);
        setShouldPreloadDetails(true);
      }
    };

    const schedulePrefetch = () => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(runPrefetch, { timeout: 1500 });
        return;
      }
      globalThis.setTimeout(runPrefetch, 250);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        schedulePrefetch();
      },
      { rootMargin: "200px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [detailImagePreloadKey, detailImagePreloadUrls]);

  useEffect(() => {
    if (colorwayColors.length > 0 && (!activeColorHex || !colorwayColors.some((c) => c.toLowerCase() === activeColorHex.toLowerCase()))) {
      setActiveColorHex(colorwayColors[0]);
    }
  }, [activeColorHex, colorwayColors]);

  useEffect(() => {
    if (variantsForActiveColor.length === 0) {
      setSelectedVariantId("");
      return;
    }
    setSelectedVariantId((current) => {
      const stillInColor = variantsForActiveColor.find((variant) => variant._id === current);
      const stillAvailable = stillInColor
        && (variantAvailabilityState?.[current]?.stock ?? stillInColor.stock ?? 0) > 0;
      if (stillInColor && stillAvailable) return current;
      return defaultSelectableVariantForColor?._id || "";
    });
  }, [variantsForActiveColor, variantAvailabilityState, defaultSelectableVariantForColor?._id]);

  useEffect(() => {
    setVariantAvailabilityState(variantAvailability || null);
  }, [variantAvailability]);

  useEffect(() => {
    setBlockedByOrder(initialBlockedByOrder);
  }, [initialBlockedByOrder]);

  useEffect(() => {
    if (!id) return;

    const unsubscribeSSE = subscribeToAvailabilityStream(
      (event) => {
        if (event.productId !== id) return;
        if (event.variantAvailability !== null) {
          setVariantAvailabilityState(event.variantAvailability);
        }
      },
    );

    return unsubscribeSSE;
  }, [id]);

  const handleColorwayClick = (e: React.MouseEvent, hex: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveColorHex(hex);
    const nextVariants = variants.filter(
      (variant) => variant.color?.toLowerCase() === hex.toLowerCase(),
    );
    const next = nextVariants.find(
      (variant) => (variantAvailabilityState?.[variant._id]?.stock ?? variant.stock ?? 0) > 0,
    ) || nextVariants[0];
    setSelectedVariantId(next?._id || "");
  };

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBlocked || !cartHydrated) return;

    try {
      const reservation = await reserveProduct(id, 1, selectedVariantId || null);
      addItem({
        id,
        variantId: selectedVariantId,
        name,
        price,
        brand,
        size: selectedVariant?.size || undefined,
        color: activeColorHex || undefined,
        maxStock: Math.max(1, selectedVariantStock),
        image: selectedCartImage || image,
        categories,
        productType,
        fashionSubtype,
        originPictures,
        reservationExpiresAt: reservation.reservationExpiresAt,
        cartCount: reservation.cartCount,
      }, { openCart: false });
      setAddedToCart(true);
      window.setTimeout(() => setAddedToCart(false), 2000);
      setIsDropdownOpen(false);
    } catch {
      setIsDropdownOpen(false);
    }
  };

  const handleAddToTryOn = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBlocked || isPerfume || !cartHydrated) return;

    try {
      const reservation = await reserveProduct(id, 1, selectedVariantId || null);
      addItem({
        id,
        variantId: selectedVariantId,
        name,
        categories,
        price,
        brand,
        size: selectedVariant?.size || undefined,
        color: activeColorHex || undefined,
        maxStock: Math.max(1, selectedVariantStock),
        image: selectedCartImage || image,
        productType,
        fashionSubtype,
        originPictures,
        reservationExpiresAt: reservation.reservationExpiresAt,
        cartCount: reservation.cartCount,
      }, { openCart: false });
      queueStudioAssignment({
        id,
        name,
        categories,
        image: selectedStoreImage || selectedCartImage || image,
        color: activeColorHex || undefined,
        price,
        brand,
        quantity: 1,
        maxStock: Math.max(1, selectedVariantStock),
        productType,
        fashionSubtype,
        originPictures,
        size: selectedVariant?.size || undefined,
      });
      router.push("/studio");
      setIsDropdownOpen(false);
    } catch {
      setIsDropdownOpen(false);
    }
  };

  const toggleDropdown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasSizes) return;
    setIsDropdownOpen((prev) => !prev);
  };

  const handleSizeSelect = (e: React.MouseEvent, variantId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedVariantId(variantId);
    setIsDropdownOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const getClonePreviewPosition = (x: number, y: number) => {
    if (typeof window === "undefined") {
      return { left: x + CLONE_PREVIEW_OFFSET, top: y + CLONE_PREVIEW_OFFSET };
    }

    const maxLeft = window.innerWidth - CLONE_PREVIEW_WIDTH - 16;
    const maxTop = window.innerHeight - CLONE_PREVIEW_HEIGHT - 16;
    const preferredLeft = x + CLONE_PREVIEW_OFFSET;
    const preferredTop = y + CLONE_PREVIEW_OFFSET;
    const fallbackLeft = x - CLONE_PREVIEW_WIDTH - CLONE_PREVIEW_OFFSET;
    const fallbackTop = y - CLONE_PREVIEW_HEIGHT - CLONE_PREVIEW_OFFSET;

    return {
      left:
        preferredLeft <= maxLeft
          ? preferredLeft
          : Math.max(16, Math.min(maxLeft, fallbackLeft)),
      top:
        preferredTop <= maxTop
          ? preferredTop
          : Math.max(16, Math.min(maxTop, fallbackTop)),
    };
  };

  const showClonePreviewAtPointer = (x: number, y: number) => {
    setClonePreview({ visible: true, x, y });
  };

  return (
    <Link
      ref={cardRef}
      href={cardHref}
      prefetch={false}
      data-browse-product-id={browseProductId || undefined}
      className="group cursor-pointer block relative"
      onClick={onProductNavigate}
    >
      {shouldPreloadDetails && <ProductDetailImagePrefetcher urls={detailImagePreloadUrls} />}
      {isPerfume && cloneSourceImage && clonePreview.visible && (
        <div
          className="fixed z-[70] pointer-events-none h-[15rem] w-[11.5rem] overflow-hidden rounded border border-white/40 bg-background/95 p-3 shadow-2xl backdrop-blur-sm transition-opacity duration-150"
          style={getClonePreviewPosition(clonePreview.x, clonePreview.y)}
        >
          <MediaRenderer
            src={cloneSourceImage}
            alt={cloneSourceName || "Original fragrance"}
            className="w-full h-full object-contain"
            imageClassName="w-full h-full object-contain"
            videoClassName="w-full h-full object-contain"
            audioClassName="w-full"
            sizes="184px"
          />
        </div>
      )}
      <div
        className="relative overflow-hidden product-image-wrapper bg-surface"
        onMouseEnter={(e) => {
          if (!isPerfume || !cloneSourceImage) return;
          showClonePreviewAtPointer(e.clientX, e.clientY);
        }}
        onMouseMove={(e) => {
          if (!isPerfume || !cloneSourceImage) return;
          showClonePreviewAtPointer(e.clientX, e.clientY);
        }}
        onMouseLeave={() => setClonePreview({ visible: false, x: 0, y: 0 })}
      >
        {displayImage ? (
          <MediaRenderer
            src={displayImage}
            alt={name}
            className="block w-full h-auto object-contain"
            imageClassName="block w-full h-auto object-contain"
            videoClassName="block w-full h-auto object-contain"
            audioClassName="block w-full px-3 py-6"
            priority={imagePriority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          />
        ) : (
          <>
            <div className="placeholder-img aspect-[3/4] w-full" />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] tracking-widest opacity-50">
              PRODUCT
            </span>
          </>
        )}

        {(tag || isSoldOut || showNewBadge) && (
          <div className="absolute top-2 left-2 z-20 flex flex-col gap-1">
            {tag && (
              <span className="bg-foreground text-background text-[10px] px-2 py-0.5 font-medium tracking-wide">
                {tag}
              </span>
            )}
            {isSoldOut ? (
              <span className="bg-foreground text-background text-[10px] px-2 py-0.5 font-medium tracking-wide">
                SOLD
              </span>
            ) : initialBlockedByOrder ? (
              <span className="bg-foreground text-background text-[10px] px-2 py-0.5 font-medium tracking-wide">
                Reserved for confirmation
              </span>
            ) : showNewBadge ? (
              <span className="bg-foreground text-background text-[10px] px-2 py-0.5 font-medium tracking-wide">
                NEW
              </span>
            ) : null}
          </div>
        )}

        {isPerfume && cloneSourceName && (
          <div className="absolute inset-x-0 bottom-10 z-20 px-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none">
            <div className="bg-background/92 backdrop-blur-sm border border-border-color px-3 py-2">
              <p className="text-[9px] uppercase tracking-[0.24em] text-text-secondary">Inspired by</p>
              <p className="text-[11px] text-foreground mt-1 line-clamp-2">{cloneSourceName}</p>
            </div>
          </div>
        )}

        {isPerfume ? (
          <div className="absolute bottom-0 left-0 right-0 z-30 translate-y-full transition-transform duration-300 ease-out group-hover:translate-y-0">
            <button
              onClick={handleQuickAdd}
              disabled={isBlocked || !cartHydrated}
              className={`w-full h-10 text-[10px] uppercase font-bold tracking-widest transition-colors ${
                isBlocked || !cartHydrated
                  ? "bg-border-color text-text-secondary cursor-not-allowed"
                  : "bg-foreground text-background hover:bg-black"
              }`}
            >
              {isBlocked ? statusLabel : "Add Cart"}
            </button>
          </div>
        ) : (
          <div
            className={`absolute bottom-0 left-0 right-0 transition-transform duration-300 ease-out z-30 ${
              isDropdownOpen ? "translate-y-0" : "translate-y-full group-hover:translate-y-0"
            }`}
          >
            <div className="bg-background flex items-center h-10 border-t border-border-color">
              {hasSizes && (
                <div className="relative w-[38%] h-full" ref={dropdownRef}>
                  <div
                    onClick={toggleDropdown}
                    className="w-full h-full flex items-center justify-between px-3 text-[10px] text-foreground font-medium uppercase tracking-wide border-r border-border-color transition-colors hover:bg-hover cursor-pointer"
                  >
                    <span>Size {selectedVariant?.size || ""}</span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>

                  {isDropdownOpen && (
                    <div
                      className="absolute bottom-full left-0 w-[120%] bg-background border border-foreground z-40 flex flex-col mb-[-1px]"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      {sizedVariants.map((variant) => {
                        const info = variantAvailabilityState?.[variant._id];
                        const stockForVariant = info ? info.stock : variant.stock ?? 0;
                        return (
                          <div
                            key={variant._id}
                            onClick={(e) => handleSizeSelect(e, variant._id)}
                            className="px-3 py-2.5 text-[10px] text-foreground font-medium hover:bg-surface transition-colors cursor-pointer flex items-center justify-between gap-2"
                          >
                            <span>{variant.size}</span>
                            {stockForVariant === 0 ? (
                              <span className="text-[9px] uppercase tracking-wide text-text-secondary">Sold out</span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {isBlocked ? (
                <button
                  type="button"
                  disabled
                  className="w-full h-full px-2 py-3 text-[10px] font-medium uppercase tracking-wide bg-border-color text-text-secondary cursor-not-allowed"
                >
                  {statusLabel}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleQuickAdd}
                    disabled={!cartHydrated}
                    className={`flex-1 h-full px-2 py-3 text-[10px] font-medium uppercase tracking-wide transition-all duration-300 ${
                      !cartHydrated
                        ? "cursor-not-allowed bg-border-color text-text-secondary"
                        : addedToCart
                          ? "bg-[#5C6A47] text-white"
                          : "bg-foreground text-background hover:bg-accent"
                    }`}
                  >
                    {addedToCart ? "✓ ADDED" : "ADD"}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddToTryOn}
                    disabled={!cartHydrated}
                    className={`flex-1 h-full text-[10px] uppercase font-bold tracking-widest border-l border-border-color transition-colors ${
                      cartHydrated
                        ? "bg-background text-foreground hover:bg-hover"
                        : "cursor-not-allowed bg-border-color text-text-secondary"
                    }`}
                  >
                    TRY
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {!isPerfume && colorwayColors.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {colorwayColors.map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              onClick={(e) => handleColorwayClick(e, hex)}
              className={`w-4 h-4 border transition-all duration-150 ${
                activeColorHex?.toLowerCase() === hex.toLowerCase()
                  ? "border-foreground scale-110"
                  : "border-border-color hover:border-foreground"
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      )}
      <div className="mt-2 space-y-1">
        <p className="text-sm uppercase tracking-wider font-semibold text-foreground truncate">{formatTndPrice(price)}</p>
        <p className="text-[10px] uppercase tracking-wider font-normal text-foreground truncate">{name}</p>
        {isPerfume && cloneSourceName && (
          <p className="text-[10px] text-text-secondary truncate">Clones {cloneSourceName}</p>
        )}
        {!isPerfume && hasCondition && (
          <div className="space-y-1">
            <div className="h-1 w-full bg-border-color overflow-hidden">
              <div className="h-full" style={{ width: `${conditionPercent}%`, backgroundColor: conditionColor }} />
            </div>
            <p className="text-[10px] text-text-secondary capitalize">{conditionLabel}</p>
          </div>
        )}
      </div>
      {/* unused state surface */}
      <span hidden>{blockedByOrder ? "1" : ""}{storeType || ""}</span>
    </Link>
  );
}
