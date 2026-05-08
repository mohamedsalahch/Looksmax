"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/providers/CartContext";
import MediaRenderer from "@/components/MediaRenderer";
import { getReservationKey, reserveProduct, subscribeToReservationChanges } from "@/lib/reservations";
import { subscribeToAvailabilityStream } from "@/lib/availabilityStream";
import { formatTndPrice } from "@/lib/formatPrice";
import { getConditionColor, getConditionLabel, getConditionPercent } from "@/lib/productCondition";
import { queueStudioAssignment } from "@/lib/studioAssignment";
import { getColorwayEnhancedFrontImage, getColorwayEnhancedLeftImage, getColorwayMainImage } from "@/lib/colorwayImage";

type ProductType = "fashion" | "perfume" | "clothing" | "shoes";

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
  reservedElsewhere?: boolean;
  ownedReservation?: boolean;
  blockedByOrder?: boolean;
  conditionScore?: number | null;
  conditionStatus?: string | null;
  productType?: ProductType;
  fashionSubtype?: "clothes" | "shoes" | null;
  sizes?: string[];
  size?: string;
  sizeAvailability?: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null;
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
  images?: { url: string; isMain: boolean }[];
  preferCollectionLeftImage?: boolean;
}

const CLONE_PREVIEW_WIDTH = 184;
const CLONE_PREVIEW_HEIGHT = 240;
const CLONE_PREVIEW_OFFSET = 24;

function splitVariantLabel(value: string) {
  const separatorIndex = value.lastIndexOf(" / ");
  if (separatorIndex === -1) {
    return { sizeLabel: value.trim(), colorHex: "" };
  }

  return {
    sizeLabel: value.slice(0, separatorIndex).trim(),
    colorHex: value.slice(separatorIndex + 3).trim(),
  };
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
  reservedElsewhere: initialReservedElsewhere = false,
  ownedReservation: initialOwnedReservation = false,
  blockedByOrder: initialBlockedByOrder = false,
  conditionScore = null,
  conditionStatus = null,
  productType = "fashion",
  fashionSubtype = "clothes",
  sizes,
  size,
  sizeAvailability,
  originPictures,
  cloneSourceName = "",
  cloneSourceImage = "",
  storeType,
  colorImages,
  images = [],
  preferCollectionLeftImage = false,
}: ProductCardProps) {
  const { addItem } = useCart();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [hasHydratedAvailability, setHasHydratedAvailability] = useState(false);
  const [sizeAvailabilityState, setSizeAvailabilityState] = useState(sizeAvailability || null);
  const [viewerBlocked, setViewerBlocked] = useState<boolean>(initialReservedElsewhere);
  const availabilitySizeKeys = Object.keys(sizeAvailabilityState || {});
  const allSizes = (
    availabilitySizeKeys.some((entry) => entry.includes(" / "))
      ? availabilitySizeKeys
      : sizes?.length
        ? sizes
        : availabilitySizeKeys.length > 0
          ? availabilitySizeKeys
          : size
            ? [size]
            : []
  ).filter((entry) => Boolean(entry.trim()));
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [clonePreview, setClonePreview] = useState({ visible: false, x: 0, y: 0 });
  const colorwayHexes = useMemo(
    () => {
      const fromColorImages = colorImages
        ? Object.keys(colorImages).filter(Boolean)
        : [];
      return fromColorImages.length > 0
        ? fromColorImages
        : (Array.from(new Set(allSizes.map((entry) => splitVariantLabel(entry).colorHex).filter(Boolean))) as string[]);
    },
    [allSizes, colorImages],
  );
  const [activeColorHex, setActiveColorHex] = useState<string | null>(colorwayHexes[0] || null);
  const selectedCartImage = getColorwayMainImage(activeColorHex, { image, images, colorImages }, image);
  const selectedStoreImage = getColorwayEnhancedFrontImage(activeColorHex, { image, images, colorImages }, image);
  const selectedCollectionImage = preferCollectionLeftImage && fashionSubtype === "shoes"
    ? getColorwayEnhancedLeftImage(activeColorHex, { image, images, colorImages }, image)
    : "";
  const displayImage = selectedCollectionImage || selectedCartImage || image;
  const normalizedConditionScore = conditionScore ?? 0;

  const handleColorwayClick = (e: React.MouseEvent, hex: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveColorHex(hex);
    const nextSizes = allSizes.filter((entry) => splitVariantLabel(entry).colorHex === hex);
    const nextSize = nextSizes.find((entry) => (sizeAvailabilityState?.[entry]?.stock ?? 0) > 0) || nextSizes[0] || "";
    setSelectedSize(nextSize);
  };
  const [blockedByOrder, setBlockedByOrder] = useState(initialBlockedByOrder);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isPerfume = productType === "perfume";
  const hasCondition = colorwayHexes.length === 0 && conditionScore != null;
  const conditionPercent = hasCondition ? getConditionPercent(normalizedConditionScore) : 0;
  const conditionLabel = hasCondition ? getConditionLabel(normalizedConditionScore, conditionStatus ?? undefined) : "";
  const conditionColor = hasCondition ? getConditionColor(normalizedConditionScore) : "transparent";
  const hasExplicitNewTag = tag?.trim().toUpperCase() === "NEW";
  const showNewBadge = !hasExplicitNewTag && !isPerfume && hasCondition && normalizedConditionScore >= 10;
  const displayedSizes = useMemo(
    () => (!isPerfume
      ? (activeColorHex
          ? allSizes.filter((entry) => splitVariantLabel(entry).colorHex === activeColorHex)
          : allSizes)
      : []),
    [activeColorHex, allSizes, isPerfume],
  );
  const hasSizes = !isPerfume && displayedSizes.length > 0;
  const defaultSelectableSize = displayedSizes.find((sizeOption) => (sizeAvailabilityState?.[sizeOption]?.stock ?? 0) > 0) || displayedSizes[0] || "";
  const [selectedSize, setSelectedSize] = useState(defaultSelectableSize);
  const selectedSizeAvailability = !isPerfume && selectedSize ? sizeAvailabilityState?.[selectedSize] : null;
  const getSizeOptionState = (sizeOption: string) => sizeAvailabilityState?.[sizeOption] || null;
  const selectedSizeStock = (() => {
    if (!isPerfume && selectedSizeAvailability) {
      return selectedSizeAvailability.stock;
    }
    return stock;
  })();
  const isSoldOut = !isPerfume && selectedSizeAvailability
    ? selectedSizeAvailability.stock <= 0 && !selectedSizeAvailability.reservedElsewhere
    : false;
  // viewerBlocked is computed server-side per viewer. True when:
  //   - viewer owns at least one reservation on this product AND some size
  //     overbooks (owned + others > stock), OR
  //   - viewer owns nothing AND every in-stock size is fully held by others.
  const showReservedElsewhere = !isPerfume && hasHydratedAvailability && viewerBlocked;
  const isBlocked = !isPerfume && selectedSizeStock <= 0;
  const statusLabel = showReservedElsewhere
    ? "Reserved elsewhere"
    : "Sold Out";
  const cardHref = !isPerfume && isMounted && selectedSize
    ? {
        pathname: `/product/${id}`,
        query: { size: selectedSize, color: activeColorHex || undefined },
      }
    : `/product/${id}`;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (colorwayHexes.length > 0 && (!activeColorHex || !colorwayHexes.includes(activeColorHex))) {
      setActiveColorHex(colorwayHexes[0]);
      return;
    }
  }, [activeColorHex, colorwayHexes]);

  useEffect(() => {
    if (displayedSizes.length === 0) {
      setSelectedSize("");
      return;
    }

    setSelectedSize((current) => {
      if (current && displayedSizes.includes(current) && (sizeAvailabilityState?.[current]?.stock ?? 0) > 0) {
        return current;
      }

      return defaultSelectableSize;
    });
  }, [displayedSizes.join("|"), defaultSelectableSize, sizeAvailabilityState]);

  useEffect(() => {
    setSizeAvailabilityState(sizeAvailability || null);
  }, [sizeAvailability]);

  useEffect(() => {
    setBlockedByOrder(initialBlockedByOrder);
  }, [initialBlockedByOrder]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const refresh = () => {
      const rk = getReservationKey();
      const url = rk
        ? `/api/products/${id}?rk=${encodeURIComponent(rk)}`
        : `/api/products/${id}`;
      fetch(url, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled || !data.product) return;
          setSizeAvailabilityState(data.product.sizeAvailability || null);
          setBlockedByOrder(Boolean(data.product.blockedByOrder));
          setViewerBlocked(Boolean(data.product.viewerBlocked));
          setHasHydratedAvailability(true);
        })
        .catch(() => {});
    };

    // Initial hydration
    refresh();

    // Re-fetch when user returns to the tab (catches any SSE events missed while hidden)
    window.addEventListener("focus", refresh);

    // Apply SSE payload directly — no round-trip fetch needed.
    // On reconnect, do a full fetch to restore user-specific fields (blockedByOrder, etc.)
    const unsubscribeSSE = subscribeToAvailabilityStream(
      (event) => {
        if (event.productId !== id) return;
        setViewerBlocked(Boolean(event.viewerBlocked));
        if (event.sizeAvailability !== null) {
          setSizeAvailabilityState(event.sizeAvailability);
          setHasHydratedAvailability(true);
        }
        // sizeAvailability === null means a non-size product (perfume);
        // ProductCard has no blocked state for perfumes so nothing to update.
      },
      refresh,
    );

    // Re-fetch when this tab's own cart action changes this product
    const unsubscribeLocal = subscribeToReservationChanges((payload) => {
      if (payload.productId !== id) return;
      refresh();
    });

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      unsubscribeSSE();
      unsubscribeLocal();
    };
  }, [id]);

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBlocked) return;

    try {
      const reservation = await reserveProduct(id, 1, isPerfume ? undefined : selectedSize);
      addItem({
        id,
        name,
        price,
        brand,
        size: isPerfume ? undefined : selectedSize,
        color: activeColorHex || undefined,
        maxStock: Math.max(1, selectedSizeStock),
        image: selectedStoreImage || selectedCartImage || image,
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
    if (isBlocked || isPerfume) return;

    try {
      const reservation = await reserveProduct(id, 1, isPerfume ? undefined : selectedSize);
      addItem({
        id,
        name,
        categories,
        price,
        brand,
        size: isPerfume ? undefined : selectedSize,
        color: activeColorHex || undefined,
        maxStock: Math.max(1, selectedSizeStock),
        image: selectedStoreImage || selectedCartImage || image,
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
        maxStock: Math.max(1, selectedSizeStock),
        productType,
        fashionSubtype,
        originPictures,
        size: isPerfume ? undefined : selectedSize,
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

  const handleSizeSelect = (e: React.MouseEvent, size: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSize(size);
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
    setClonePreview({
      visible: true,
      x,
      y,
    });
  };

  return (
    <Link
      href={cardHref}
      className="group cursor-pointer block relative"
    >
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
          />
        ) : (
          <>
            <div className="placeholder-img aspect-[3/4] w-full" />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] tracking-widest opacity-50">
              PRODUCT
            </span>
          </>
        )}

        {(tag || isSoldOut || showReservedElsewhere || showNewBadge) && (
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
            ) : showReservedElsewhere ? (
              <span className="bg-foreground text-background text-[10px] px-2 py-0.5 font-medium tracking-wide">
                Reserved elsewhere
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
              disabled={isBlocked}
              className={`w-full h-10 text-[10px] uppercase font-bold tracking-widest transition-colors ${
                isBlocked
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
              <div className="relative w-[38%] h-full" ref={dropdownRef}>
                <div
                  onClick={toggleDropdown}
                  className={`w-full h-full flex items-center justify-between px-3 text-[10px] text-foreground font-medium uppercase tracking-wide border-r border-border-color transition-colors ${
                    hasSizes ? "hover:bg-hover cursor-pointer" : "cursor-default"
                  }`}
                >
                  <span>
                    {hasSizes
                      ? `Size ${splitVariantLabel(selectedSize || defaultSelectableSize).sizeLabel}`
                      : "One size"}
                  </span>
                  {hasSizes && (
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
                  )}
                </div>

                {hasSizes && isDropdownOpen && (
                  <div
                    className="absolute bottom-full left-0 w-[120%] bg-background border border-foreground z-40 flex flex-col mb-[-1px]"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    {displayedSizes.map((sizeOption) => {
                      const { sizeLabel } = splitVariantLabel(sizeOption);
                      return (
                      <div
                        key={sizeOption}
                        onClick={(e) => handleSizeSelect(e, sizeOption)}
                        className="px-3 py-2.5 text-[10px] text-foreground font-medium hover:bg-surface transition-colors cursor-pointer flex items-center justify-between gap-2"
                      >
                        <span>{sizeLabel}</span>
                        {(getSizeOptionState(sizeOption)?.stock ?? 0) === 0 ? (
                          <span className="text-[9px] uppercase tracking-wide text-text-secondary">Sold out</span>
                        ) : hasHydratedAvailability && getSizeOptionState(sizeOption)?.reservedElsewhere ? (
                          <span className="text-[9px] uppercase tracking-wide text-text-secondary">Reserved elsewhere</span>
                        ) : null}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

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
                    className={`w-[49.5%] h-full px-2 py-3 text-[10px] font-medium uppercase tracking-wide transition-all duration-300 ${
                      addedToCart
                        ? "bg-[#5C6A47] text-white"
                        : "bg-foreground text-background hover:bg-accent"
                    }`}
                  >
                    {addedToCart ? "✓ ADDED" : "ADD"}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddToTryOn}
                    className="w-[49.5%] h-full text-[10px] uppercase font-bold tracking-widest border-l border-border-color transition-colors bg-background text-foreground hover:bg-hover"
                  >
                    TRY
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {!isPerfume && colorwayHexes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {colorwayHexes.map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              onClick={(e) => handleColorwayClick(e, hex)}
              className={`w-4 h-4 border transition-all duration-150 ${
                activeColorHex === hex ? "border-foreground scale-110" : "border-border-color hover:border-foreground"
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
    </Link>
  );
}
