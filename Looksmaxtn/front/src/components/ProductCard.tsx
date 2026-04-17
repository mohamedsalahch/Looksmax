"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/providers/CartContext";
import {
  reserveProduct,
  subscribeToReservationChanges,
} from "@/lib/reservations";
import { formatTndPrice } from "@/lib/formatPrice";
import { getConditionColor, getConditionLabel, getConditionPercent } from "@/lib/productCondition";
import { queueStudioAssignment } from "@/lib/studioAssignment";

type ProductType = "fashion" | "perfume" | "clothing" | "shoes";

interface ProductCardProps {
  id: string;
  name: string;
  categories?: string[];
  price: string;
  tag?: string;
  image?: string;
  stock?: number;
  cartCount?: number;
  conditionScore?: number | null;
  conditionStatus?: string | null;
  productType?: ProductType;
  fashionSubtype?: "clothes" | "shoes" | null;
  sizes?: string[];
  size?: string;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
  cloneSourceName?: string;
  cloneSourceImage?: string;
}

const CLONE_PREVIEW_WIDTH = 184;
const CLONE_PREVIEW_HEIGHT = 240;
const CLONE_PREVIEW_OFFSET = 24;

export default function ProductCard({
  id,
  name,
  categories = [],
  price,
  tag,
  image,
  stock = 1,
  cartCount: initialCartCount = 0,
  conditionScore = 7,
  conditionStatus = "used",
  productType = "fashion",
  fashionSubtype = "clothes",
  sizes,
  size,
  originPictures,
  cloneSourceName = "",
  cloneSourceImage = "",
}: ProductCardProps) {
  const { addItem, items } = useCart();
  const router = useRouter();
  const availableSizes = (sizes?.length ? sizes : size ? [size] : []).filter((entry) => Boolean(entry.trim()));
  const [selectedSize, setSelectedSize] = useState(availableSizes[0] || "");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [cartCount, setCartCount] = useState(initialCartCount);
  const [addedToCart, setAddedToCart] = useState(false);
  const [clonePreview, setClonePreview] = useState({ visible: false, x: 0, y: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isPerfume = productType === "perfume";
  const conditionPercent = getConditionPercent(conditionScore ?? 7);
  const conditionLabel = getConditionLabel(conditionScore ?? 7, conditionStatus ?? undefined);
  const conditionColor = getConditionColor(conditionScore ?? 7);
  const showNewBadge = !isPerfume && (conditionScore ?? 0) >= 10;
  const isSoldOut = stock < 1;
  const hasSizes = !isPerfume && availableSizes.length > 0;
  const isInLocalCart = items.some((item) => item.id.split("-")[0] === id);
  const showReservedElsewhere = cartCount > (isInLocalCart ? 1 : 0);

  useEffect(() => {
    if (availableSizes.length === 0) {
      setSelectedSize("");
      return;
    }

    setSelectedSize((current) => (availableSizes.includes(current) ? current : availableSizes[0]));
  }, [availableSizes.join("|")]);

  useEffect(() => {
    setCartCount(initialCartCount);
  }, [initialCartCount]);

  useEffect(() => {
    return subscribeToReservationChanges(({ productId, cartCount: nextCartCount }) => {
      if (productId !== id) return;
      if (typeof nextCartCount === "number") {
        setCartCount(nextCartCount);
      }
    });
  }, [id]);

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSoldOut) return;

    try {
      const reservation = await reserveProduct(id);
      setCartCount(reservation.cartCount ?? cartCount + 1);
      addItem({
        id,
        name,
        price,
        brand: "LOOKSMAX",
        size: isPerfume ? undefined : selectedSize,
        maxStock: Math.max(1, stock),
        image,
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
    if (isSoldOut || isPerfume) return;

    try {
      const reservation = await reserveProduct(id);
      setCartCount(reservation.cartCount ?? cartCount + 1);
      addItem({
        id,
        name,
        categories,
        price,
        brand: "LOOKSMAX",
        size: isPerfume ? undefined : selectedSize,
        maxStock: Math.max(1, stock),
        image,
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
        image,
        price,
        brand: "LOOKSMAX",
        quantity: 1,
        maxStock: Math.max(1, stock),
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
    <Link href={`/product/${id}`} className="group cursor-pointer block relative">
      {isPerfume && cloneSourceImage && clonePreview.visible && (
        <div
          className="fixed z-[70] pointer-events-none h-[15rem] w-[11.5rem] overflow-hidden rounded border border-white/40 bg-background/95 p-3 shadow-2xl backdrop-blur-sm transition-opacity duration-150"
          style={getClonePreviewPosition(clonePreview.x, clonePreview.y)}
        >
          <img
            src={cloneSourceImage}
            alt={cloneSourceName || "Original fragrance"}
            className="w-full h-full object-contain"
          />
        </div>
      )}
      <div
        className="relative aspect-[3/4] overflow-hidden product-image-wrapper bg-surface"
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
        {image ? (
          <img src={image} alt={name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <>
            <div className="absolute inset-0 placeholder-img" />
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
              disabled={isSoldOut}
              className={`w-full h-10 text-[10px] uppercase font-bold tracking-widest transition-colors ${
                isSoldOut
                  ? "bg-border-color text-text-secondary cursor-not-allowed"
                  : "bg-foreground text-background hover:bg-black"
              }`}
            >
              Add Cart
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
                  <span>{hasSizes ? `Size ${selectedSize}` : "One size"}</span>
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
                    {availableSizes.map((sizeOption) => (
                      <div
                        key={sizeOption}
                        onClick={(e) => handleSizeSelect(e, sizeOption)}
                        className="px-3 py-2.5 text-[10px] text-foreground font-medium hover:bg-surface transition-colors cursor-pointer"
                      >
                        {sizeOption}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleQuickAdd}
                disabled={isSoldOut}
                className={`w-[31%] h-full px-2 py-3 text-[10px] font-medium uppercase tracking-wide transition-all duration-300 ${
                  isSoldOut
                    ? "bg-border-color text-text-secondary cursor-not-allowed"
                    : addedToCart
                      ? "bg-[#5C6A47] text-white"
                      : "bg-foreground text-background hover:bg-accent"
                }`}
              >
                {isSoldOut
                  ? "Sold Out"
                  : addedToCart
                    ? "✓ ADDED"
                    : "ADDche"}
              </button>
              <button
                type="button"
                onClick={handleAddToTryOn}
                disabled={isSoldOut}
                className={`w-[31%] h-full text-[10px] uppercase font-bold tracking-widest border-l border-border-color transition-colors ${
                  isSoldOut
                    ? "bg-border-color text-text-secondary cursor-not-allowed"
                    : "bg-background text-foreground hover:bg-hover"
                }`}
              >
                TRY
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="text-xs font-semibold text-foreground truncate">{name}</p>
        {isPerfume && cloneSourceName && (
          <p className="text-[10px] text-text-secondary truncate">Clones {cloneSourceName}</p>
        )}
        <p className="text-xs text-text-secondary">{formatTndPrice(price)}</p>
        {!isPerfume && (
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
