"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/providers/CartContext";
import { getReservationKey, reserveProduct, subscribeToReservationChanges } from "@/lib/reservations";
import { subscribeToAvailabilityStream } from "@/lib/availabilityStream";
import { formatTndPrice } from "@/lib/formatPrice";
import { getConditionColor, getConditionLabel, getConditionPercent } from "@/lib/productCondition";
import { buildCartItemId } from "@/lib/cartItem";
import { queueStudioAssignment } from "@/lib/studioAssignment";

type TikTokWindow = Window & {
  ttq?: {
    track?: (eventName: string, payload?: Record<string, unknown>) => void;
  };
};

type ProductType = "fashion" | "perfume" | "clothing" | "shoes";

type ProductInfoProduct = {
  id?: string;
  name: string;
  categories?: string[];
  price: string;
  brand: string;
  storeName?: string;
  storeType?: "thrift" | "retail" | null;
  image?: string;
  size?: string;
  sizes?: string[];
  stock: number;
  sizeAvailability?: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null;
  initialSelectedSize?: string;
  initialSelectedSizeStock?: number;
  description: string;
  reservationExpiresAt?: string | null;
  cartCount?: number;
  reservedElsewhere?: boolean;
  ownedReservation?: boolean;
  blockedByOrder?: boolean;
  conditionScore?: number | null;
  conditionStatus?: string | null;
  productType?: ProductType;
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

export default function ProductInfo({ product }: { product: ProductInfoProduct }) {
  const [addedToCart, setAddedToCart] = useState(false);
  const [currentStock, setCurrentStock] = useState(() => product.stock);
  const [sizeAvailability, setSizeAvailability] = useState<Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null>(() => product.sizeAvailability || null);
  const [reservationError, setReservationError] = useState("");
  const [hasHydratedAvailability, setHasHydratedAvailability] = useState(false);
  const [reservedElsewhere, setReservedElsewhere] = useState(false);
  const [ownedReservation, setOwnedReservation] = useState(() => Boolean(product.ownedReservation));
  const [blockedByOrder, setBlockedByOrder] = useState(() => Boolean(product.blockedByOrder));
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const availableSizes = (product.sizes?.length ? product.sizes : product.size ? [product.size] : []).filter(
    (entry) => Boolean(entry.trim())
  );
  const initialSelectedSize = product.initialSelectedSize || availableSizes[0] || "";
  const defaultSelectedSize = initialSelectedSize || availableSizes[0] || "";
  const initialSelectedSizeStock = product.initialSelectedSizeStock ?? currentStock;
  const [selectedSize, setSelectedSize] = useState(defaultSelectedSize);
  const { addItem, items, updateQuantity } = useCart();
  const router = useRouter();
  const isPerfume = product.productType === "perfume";
  const getDefaultSelectableSize = (
    sizesList: string[],
    availability: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null
  ) => sizesList.find((sizeOption) => availability?.[sizeOption]?.available) || sizesList[0] || "";

  const selectedSizeStock = (() => {
    if (!isPerfume && selectedSize && sizeAvailability?.[selectedSize]) {
      return sizeAvailability[selectedSize].stock;
    }
    if (!isPerfume && selectedSize && initialSelectedSize === selectedSize) {
      return initialSelectedSizeStock;
    }
    return currentStock;
  })();
  const selectedSizeReservedElsewhere = (() => {
    if (!isPerfume && selectedSize && sizeAvailability?.[selectedSize]) {
      return sizeAvailability[selectedSize].reservedElsewhere;
    }
    if (!isPerfume && selectedSize && initialSelectedSize === selectedSize) {
      return false;
    }
    return reservedElsewhere;
  })();
  const displaySelectedSize = selectedSize || initialSelectedSize;
  const displaySelectedSizeStock = selectedSize ? selectedSizeStock : initialSelectedSizeStock;

  const showReservedElsewhere = hasHydratedAvailability
    ? selectedSizeReservedElsewhere || (!availableSizes.length && reservedElsewhere)
    : false;
  const isSoldOut = selectedSizeStock < 1 && !showReservedElsewhere;
  const isBlocked = selectedSizeStock < 1;
  const statusLabel = showReservedElsewhere
    ? "Reserved elsewhere"
    : "Sold Out";
  const cartItemId = product.id
    ? buildCartItemId(product.id, isPerfume ? undefined : selectedSize)
    : "";
  const cartItemQuantity = items.find((item) => item.id === cartItemId)?.quantity || 0;

  const refreshAvailability = () => {
    if (!product.id) return;

    const rk = getReservationKey();
    const url = rk
      ? `/api/products/${product.id}?rk=${encodeURIComponent(rk)}`
      : `/api/products/${product.id}`;
    fetch(url, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!data.product) return;
        setCurrentStock(data.product.stock ?? 0);
        setReservedElsewhere(Boolean(data.product.reservedElsewhere));
        setOwnedReservation(Boolean(data.product.ownedReservation));
        setBlockedByOrder(Boolean(data.product.blockedByOrder));
        if (data.product.sizeAvailability) {
          setSizeAvailability(data.product.sizeAvailability);
        }
        setHasHydratedAvailability(true);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!product.id) return;

    let cancelled = false;

    // Initial hydration — user-specific fields (ownedReservation, blockedByOrder, reservedElsewhere)
    refreshAvailability();

    const handleFocus = () => {
      if (!cancelled) refreshAvailability();
    };
    window.addEventListener("focus", handleFocus);

    // Apply neutral availability from SSE payload directly — no round-trip fetch needed.
    // On reconnect, do a full fetch to restore user-specific fields.
    const unsubscribeSSE = subscribeToAvailabilityStream(
      (event) => {
        if (cancelled || event.productId !== product.id) return;
        if (event.sizeAvailability !== null) {
          setSizeAvailability(event.sizeAvailability);
        } else {
          setCurrentStock(event.stock);
        }
        setHasHydratedAvailability(true);
      },
      () => {
        if (!cancelled) refreshAvailability();
      },
    );

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      unsubscribeSSE();
    };
  }, [product.id]);

  useEffect(() => {
    setSelectedQuantity((current) => Math.min(Math.max(1, current), Math.max(1, selectedSizeStock)));
  }, [selectedSizeStock]);

  useEffect(() => {
    if (!product.id) return;

    const nextQuantity = cartItemQuantity > 0 ? cartItemQuantity : 1;
    setSelectedQuantity(Math.min(Math.max(1, nextQuantity), Math.max(1, selectedSizeStock)));
  }, [product.id, cartItemQuantity, selectedSizeStock, selectedSize, isPerfume]);

  const syncQuantity = (nextQuantity: number) => {
    const boundedQuantity = Math.min(Math.max(1, nextQuantity), Math.max(1, selectedSizeStock));
    setSelectedQuantity(boundedQuantity);
    if (cartItemQuantity > 0 && cartItemId) {
      updateQuantity(cartItemId, boundedQuantity);
    }
  };

  useEffect(() => {
    if (availableSizes.length === 0) {
      setSelectedSize("");
      return;
    }

    setSelectedSize((current) => {
      const currentInfo = current ? sizeAvailability?.[current] : null;
      if (current && availableSizes.includes(current) && (currentInfo?.stock ?? 0) > 0) return current;
      if (defaultSelectedSize && availableSizes.includes(defaultSelectedSize)) {
        return defaultSelectedSize;
      }
      return getDefaultSelectableSize(availableSizes, sizeAvailability);
    });
  }, [availableSizes.join("|"), defaultSelectedSize, sizeAvailability]);

  useEffect(() => {
    setOwnedReservation(Boolean(product.ownedReservation));
  }, [product.ownedReservation]);

  useEffect(() => {
    setBlockedByOrder(Boolean(product.blockedByOrder));
  }, [product.blockedByOrder]);

  useEffect(() => {
    if (!product.id) return;

    const unsubscribe = subscribeToReservationChanges((payload) => {
      if (payload.productId !== product.id) return;
      refreshAvailability();
    });

    return unsubscribe;
  }, [product.id]);

  const handleAddToCart = async () => {
    setReservationError("");
    if (isBlocked) return;
    if (cartItemQuantity > 0) {
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
      return;
    }

    try {
      const reservation = await reserveProduct(
        product.id || "unknown",
        selectedQuantity,
        isPerfume ? undefined : selectedSize
      );
      addItem({
        id: product.id || "unknown",
        name: product.name,
        price: product.price,
        brand: product.brand,
        image: product.image,
        categories: product.categories,
        size: isPerfume ? undefined : selectedSize,
        maxStock: Math.max(1, selectedSizeStock),
        productType: product.productType,
        fashionSubtype: product.fashionSubtype,
        originPictures: product.originPictures,
        reservationExpiresAt: reservation.reservationExpiresAt,
        cartCount: reservation.cartCount,
        quantity: selectedQuantity,
      }, { openCart: false });
      (window as TikTokWindow).ttq?.track?.("AddToCart", {
        content_id: product.id || "unknown",
        content_name: product.name,
        content_type: "product",
        value: Number(product.price) * selectedQuantity,
        quantity: selectedQuantity,
        currency: "TND",
      });
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    } catch (error) {
      setReservationError(error instanceof Error ? error.message : "Unable to add this product to your cart.");
    }
  };

  const handleAddToTryOn = async () => {
    if (isBlocked || isPerfume) return;

    try {
      const reservation = await reserveProduct(product.id || "unknown", selectedQuantity, isPerfume ? undefined : selectedSize);
      addItem({
        id: product.id || "unknown",
        name: product.name,
        price: product.price,
        brand: product.brand,
        image: product.image,
        categories: product.categories,
        size: isPerfume ? undefined : selectedSize,
        maxStock: Math.max(1, selectedSizeStock),
        productType: product.productType,
        fashionSubtype: product.fashionSubtype,
        originPictures: product.originPictures,
        reservationExpiresAt: reservation.reservationExpiresAt,
        cartCount: reservation.cartCount,
        quantity: selectedQuantity,
      }, { openCart: false });
      queueStudioAssignment({
        id: product.id || "unknown",
        name: product.name,
        image: product.image,
        categories: product.categories,
        price: product.price,
        brand: product.brand,
        quantity: 1,
        maxStock: Math.max(1, selectedSizeStock),
        productType: product.productType,
        fashionSubtype: product.fashionSubtype,
        originPictures: product.originPictures,
        size: isPerfume ? undefined : selectedSize,
      });
      router.push("/studio");
    } catch {
      setReservationError("Unable to add this product to your cart.");
    }
  };

  const conditionPercent = getConditionPercent(product.conditionScore ?? 7);
  const conditionLabel = getConditionLabel(product.conditionScore ?? 7, product.conditionStatus ?? undefined);
  const conditionColor = getConditionColor(product.conditionScore ?? 7);
  const showNewBadge = !isPerfume && (product.conditionScore ?? 0) >= 10;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">{product.name}</h1>

      <div className="flex items-center gap-3">
        <p className="text-xl font-medium">{formatTndPrice(product.price)}</p>
        {showNewBadge && (
          <span className="text-[10px] bg-accent text-background px-2 py-1 uppercase tracking-wider font-semibold">
            New
          </span>
        )}
      </div>

      <div className="border-t border-border-color" />

      {!isPerfume && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs text-text-secondary uppercase tracking-wider">Condition</p>
            <span className="text-xs text-foreground capitalize">{conditionLabel}</span>
          </div>
          <div className="h-1.5 w-full bg-border-color overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${conditionPercent}%`, backgroundColor: conditionColor }}
            />
          </div>
        </div>
      )}

      {product.storeType !== "retail" && (
        <div>
          <p className="text-xs text-text-secondary uppercase tracking-wider">BRAND</p>
          <p className="mt-2 text-sm text-foreground">{product.brand}</p>
        </div>
      )}

      {product.storeName && (
        <div>
          <p className="text-xs text-text-secondary uppercase tracking-wider">STORE</p>
          <p className="mt-2 text-sm text-foreground">{product.storeName}</p>
        </div>
      )}

      {isPerfume && product.cloneSourceName && (
        <div className="grid grid-cols-[96px_1fr] gap-4 border border-border-color bg-surface/40 p-4">
          <div className="aspect-[3/4] overflow-hidden bg-surface p-2">
            {product.cloneSourceImage ? (
              <img
                src={product.cloneSourceImage}
                alt={product.cloneSourceName}
                className="w-full h-full object-contain"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="w-full h-full placeholder-img">
                <span className="relative z-10 text-[9px] tracking-widest">ORIGINAL</span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] text-text-secondary uppercase tracking-[0.24em]">
              Cloning
            </p>
            <p className="text-sm text-foreground">{product.cloneSourceName}</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              This bottle is presented alongside the fragrance profile it is inspired by.
            </p>
          </div>
        </div>
      )}

      {!isPerfume && availableSizes.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs text-text-secondary uppercase tracking-wider">Sizes</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableSizes.map((sizeOption) => {
              const sizeInfo = sizeAvailability?.[sizeOption];
              const sizeAvailable = sizeInfo ? sizeInfo.stock > 0 : currentStock > 0;
              const reservedElsewhereForSize = Boolean(sizeInfo?.reservedElsewhere);
              return (
                <button
                  key={sizeOption}
                  type="button"
                  onClick={() => sizeAvailable && setSelectedSize(sizeOption)}
                  disabled={!sizeAvailable}
                  className={`min-w-10 border px-3 py-2 text-sm font-medium transition-colors flex flex-col items-center gap-0.5 ${
                    !sizeAvailable
                      ? "border-border-color text-text-secondary bg-surface cursor-not-allowed line-through opacity-50"
                      : selectedSize === sizeOption
                        ? "border-foreground bg-foreground text-background"
                        : "border-border-color text-foreground hover:bg-hover cursor-pointer"
                  }`}
                >
                  <span>{sizeOption}</span>
                  {sizeInfo?.stock === 0 ? (
                    <span className="text-[9px] uppercase tracking-wide text-text-secondary">Sold out</span>
                  ) : hasHydratedAvailability && reservedElsewhereForSize ? (
                    <span className="text-[9px] uppercase tracking-wide text-text-secondary">Reserved elsewhere</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#7A8362]" />
        <span className="text-xs text-text-secondary">
          {isPerfume
            ? `${currentStock} bottle${currentStock !== 1 ? "s" : ""} available`
            : displaySelectedSize
              ? displaySelectedSizeStock === 1
                ? `Last one — ${displaySelectedSize}`
                : `Selected size: ${displaySelectedSize}`
              : currentStock === 1
                ? "Last one"
                : "Size selected"}
        </span>
      </div>

      {showReservedElsewhere && (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-foreground" />
          <span className="text-xs text-text-secondary">Reserved elsewhere</span>
        </div>
      )}

      {blockedByOrder && (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-foreground" />
          <span className="text-xs text-text-secondary">Reserved for confirmation</span>
        </div>
      )}

      {reservationError && <p className="text-xs text-[#430C05]">{reservationError}</p>}

      <div className="flex items-center justify-between gap-4 border border-border-color bg-surface/40 px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-text-secondary">Quantity</p>
          <p className="mt-1 text-xs text-text-secondary">Pick how many to add</p>
        </div>
        <div className="flex items-center border border-border-color">
          <button
            type="button"
            onClick={() => syncQuantity(selectedQuantity - 1)}
            disabled={isBlocked}
            className="w-8 h-8 flex items-center justify-center text-sm hover:bg-hover transition-colors cursor-pointer"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-10 h-8 flex items-center justify-center text-sm font-medium border-x border-border-color">
            {selectedQuantity}
          </span>
          <button
            type="button"
            onClick={() => syncQuantity(selectedQuantity + 1)}
            disabled={isBlocked || selectedQuantity >= selectedSizeStock}
            className={`w-8 h-8 flex items-center justify-center text-sm transition-colors cursor-pointer ${
              isBlocked || selectedQuantity >= selectedSizeStock ? "text-border-color cursor-not-allowed" : "hover:bg-hover"
            }`}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      {isBlocked ? (
        <button
          type="button"
          disabled
          className="w-full py-3.5 text-sm font-medium tracking-wide uppercase bg-border-color text-text-secondary cursor-not-allowed"
        >
          {statusLabel}
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleAddToCart}
            className={`w-full py-3.5 text-sm font-medium tracking-wide uppercase transition-all duration-300 cursor-pointer ${
              addedToCart
                ? "bg-[#5C6A47] text-white"
                : "bg-foreground text-background hover:bg-accent"
            }`}
          >
            {addedToCart ? "✓ Added to Cart" : "Add to Cart"}
          </button>
          {!isPerfume && (
            <button
              type="button"
              onClick={handleAddToTryOn}
              className="w-full py-3.5 text-sm font-medium tracking-wide uppercase transition-all duration-300 cursor-pointer border border-border-color bg-surface/40 text-foreground hover:bg-surface/70"
            >
              TRY ON
            </button>
          )}
        </div>
      )}

      <div className="border-t border-border-color" />

      <div>
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">Description</p>
        <p className="text-sm leading-relaxed text-foreground/80">{product.description}</p>
      </div>
    </div>
  );
}
