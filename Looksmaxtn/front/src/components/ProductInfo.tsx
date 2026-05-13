"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/providers/CartContext";
import { getReservationKey, reserveProduct, subscribeToReservationChanges } from "@/lib/reservations";
import { subscribeToAvailabilityStream } from "@/lib/availabilityStream";
import { formatTndPrice } from "@/lib/formatPrice";
import { getConditionColor, getConditionLabel, getConditionPercent } from "@/lib/productCondition";
import { buildCartItemId } from "@/lib/cartItem";
import { queueStudioAssignment } from "@/lib/studioAssignment";
import { getColorwayEnhancedFrontImage } from "@/lib/colorwayImage";
import type { VariantAvailabilityMap } from "@/lib/variantAvailability";

type TikTokWindow = Window & {
  ttq?: {
    track?: (eventName: string, payload?: Record<string, unknown>) => void;
  };
};

type ProductType = "fashion" | "perfume" | "clothing" | "shoes";

type ProductVariant = {
  _id: string;
  size: string;
  color: { name?: string; hex: string } | null;
  stock?: number;
  fullStock?: number;
  conditionScore?: number | null;
  images?: number[];
};

type ProductInfoProduct = {
  id?: string;
  name: string;
  categories?: string[];
  price: string;
  brand: string;
  storeName?: string;
  storeType?: "thrift" | "retail" | null;
  image?: string;
  images?: { url: string; isMain: boolean }[];
  variants: ProductVariant[];
  variantAvailability?: VariantAvailabilityMap | null;
  initialSelectedVariantId?: string;
  initialSelectedVariantStock?: number;
  initialSelectedColorHex?: string | null;
  stock: number;
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
  const router = useRouter();
  const { addItem, items, updateQuantity } = useCart();

  const variants = useMemo(() => product.variants || [], [product.variants]);
  const variantsById = useMemo(
    () => new Map(variants.map((variant) => [variant._id, variant])),
    [variants],
  );

  const uniqueColors = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ name?: string; hex: string }> = [];
    for (const variant of variants) {
      const hex = variant.color?.hex?.toLowerCase();
      if (hex && !seen.has(hex)) {
        seen.add(hex);
        result.push(variant.color!);
      }
    }
    return result;
  }, [variants]);
  const isColorwayProduct = uniqueColors.length > 0;
  const isPerfume = product.productType === "perfume";

  const [addedToCart, setAddedToCart] = useState(false);
  const [reservationError, setReservationError] = useState("");
  const [hasHydratedAvailability, setHasHydratedAvailability] = useState(false);
  const [reservedElsewhere, setReservedElsewhere] = useState(Boolean(product.reservedElsewhere));
  const [ownedReservation, setOwnedReservation] = useState(() => Boolean(product.ownedReservation));
  const [blockedByOrder, setBlockedByOrder] = useState(() => Boolean(product.blockedByOrder));
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [variantAvailability, setVariantAvailability] = useState<VariantAvailabilityMap | null>(
    () => product.variantAvailability || null,
  );
  const [currentStock, setCurrentStock] = useState(() => product.stock);

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    () => product.initialSelectedVariantId || variants[0]?._id || "",
  );

  const selectedVariant = selectedVariantId ? variantsById.get(selectedVariantId) : undefined;
  const activeHex = selectedVariant?.color?.hex || product.initialSelectedColorHex || null;
  const [selectedColorHex, setSelectedColorHex] = useState<string | null>(activeHex);

  const variantsForActiveColor = useMemo(() => {
    if (!isColorwayProduct) return variants;
    if (!selectedColorHex) return variants;
    return variants.filter(
      (variant) => variant.color?.hex?.toLowerCase() === selectedColorHex.toLowerCase(),
    );
  }, [isColorwayProduct, selectedColorHex, variants]);
  const hasVisibleSizeOptions = variantsForActiveColor.some((variant) => Boolean(variant.size.trim()));

  const selectedColorImage = getColorwayEnhancedFrontImage(selectedColorHex, {
    image: product.image,
    images: product.images,
    variants,
  }, "");
  const cartDisplayImage = selectedColorImage || product.originPictures?.front || product.image;

  useEffect(() => {
    if (!selectedColorHex) return;
    window.dispatchEvent(
      new CustomEvent("product:gallery:filterColorway", {
        detail: { hex: selectedColorHex },
      }),
    );
  }, [selectedColorHex]);

  const selectedVariantStock = (() => {
    if (selectedVariantId && variantAvailability?.[selectedVariantId]) {
      return variantAvailability[selectedVariantId].stock;
    }
    if (selectedVariantId === product.initialSelectedVariantId) {
      return product.initialSelectedVariantStock ?? currentStock;
    }
    return currentStock;
  })();

  const selectedVariantReservedElsewhere = (() => {
    if (selectedVariantId && variantAvailability?.[selectedVariantId]) {
      return variantAvailability[selectedVariantId].reservedElsewhere;
    }
    return reservedElsewhere;
  })();

  const showReservedElsewhere = hasHydratedAvailability
    ? selectedVariantReservedElsewhere ||
      (variantsForActiveColor.length === 0 && reservedElsewhere)
    : false;
  const isSoldOut = selectedVariantStock < 1 && !showReservedElsewhere;
  const isBlocked = selectedVariantStock < 1;
  const statusLabel = showReservedElsewhere ? "Reserved elsewhere" : "Sold Out";

  const cartItemId = product.id
    ? buildCartItemId(product.id, selectedVariantId || undefined)
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
        if (data.product.variantAvailability) {
          setVariantAvailability(data.product.variantAvailability);
        }
        setHasHydratedAvailability(true);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!product.id) return;
    let cancelled = false;
    refreshAvailability();

    const handleFocus = () => {
      if (!cancelled) refreshAvailability();
    };
    window.addEventListener("focus", handleFocus);

    const unsubscribeSSE = subscribeToAvailabilityStream(
      (event) => {
        if (cancelled || event.productId !== product.id) return;
        if (event.variantAvailability !== null) {
          setVariantAvailability(event.variantAvailability);
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
    setSelectedQuantity((current) => Math.min(Math.max(1, current), Math.max(1, selectedVariantStock)));
  }, [selectedVariantStock]);

  useEffect(() => {
    if (!product.id) return;

    const nextQuantity = cartItemQuantity > 0 ? cartItemQuantity : 1;
    setSelectedQuantity(Math.min(Math.max(1, nextQuantity), Math.max(1, selectedVariantStock)));
  }, [product.id, cartItemQuantity, selectedVariantStock, selectedVariantId, isPerfume]);

  const syncQuantity = (nextQuantity: number) => {
    const boundedQuantity = Math.min(Math.max(1, nextQuantity), Math.max(1, selectedVariantStock));
    setSelectedQuantity(boundedQuantity);
    if (cartItemQuantity > 0 && cartItemId) {
      updateQuantity(cartItemId, boundedQuantity);
    }
  };

  useEffect(() => {
    if (variantsForActiveColor.length === 0) {
      setSelectedVariantId("");
      return;
    }
    setSelectedVariantId((current) => {
      const currentInColor = variantsForActiveColor.find((variant) => variant._id === current);
      const currentAvailable =
        currentInColor && (variantAvailability?.[current]?.stock ?? currentInColor.stock ?? 0) > 0;
      if (currentInColor && currentAvailable) return current;
      const firstAvailable = variantsForActiveColor.find(
        (variant) => (variantAvailability?.[variant._id]?.stock ?? variant.stock ?? 0) > 0,
      );
      return (firstAvailable || variantsForActiveColor[0])._id;
    });
  }, [variantsForActiveColor, variantAvailability]);

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
        selectedVariantId || null,
      );
      addItem({
        id: product.id || "unknown",
        variantId: selectedVariantId,
        name: product.name,
        price: product.price,
        brand: product.brand,
        image: cartDisplayImage,
        color: activeHex || undefined,
        categories: product.categories,
        size: selectedVariant?.size || undefined,
        maxStock: Math.max(1, selectedVariantStock),
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
      const reservation = await reserveProduct(
        product.id || "unknown",
        selectedQuantity,
        selectedVariantId || null,
      );
      addItem({
        id: product.id || "unknown",
        variantId: selectedVariantId,
        name: product.name,
        price: product.price,
        brand: product.brand,
        image: cartDisplayImage,
        color: activeHex || undefined,
        categories: product.categories,
        size: selectedVariant?.size || undefined,
        maxStock: Math.max(1, selectedVariantStock),
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
        image: cartDisplayImage,
        color: activeHex || undefined,
        categories: product.categories,
        price: product.price,
        brand: product.brand,
        quantity: 1,
        maxStock: Math.max(1, selectedVariantStock),
        productType: product.productType,
        fashionSubtype: product.fashionSubtype,
        originPictures: product.originPictures,
        size: selectedVariant?.size || undefined,
      });
      router.push("/studio");
    } catch {
      setReservationError("Unable to add this product to your cart.");
    }
  };

  const handleSelectColorway = (hex: string) => {
    setSelectedColorHex(hex);
    const nextVariants = variants.filter(
      (variant) => variant.color?.hex?.toLowerCase() === hex.toLowerCase(),
    );
    const firstAvailable = nextVariants.find(
      (variant) => (variantAvailability?.[variant._id]?.stock ?? variant.stock ?? 0) > 0,
    );
    const next = firstAvailable || nextVariants[0];
    if (next) {
      setSelectedVariantId(next._id);
    }
    const params = new URLSearchParams();
    params.set("color", hex);
    if (next?.size) {
      params.set("size", next.size);
    } else if (selectedVariant?.size) {
      params.set("size", selectedVariant.size);
    }
    router.replace(`/product/${product.id || ""}?${params.toString()}`, { scroll: false });
    window.dispatchEvent(new CustomEvent("product:gallery:filterColorway", { detail: { hex } }));
  };

  const normalizedConditionScore = product.conditionScore ?? 0;
  const hasCondition = uniqueColors.length === 0 && product.conditionScore != null;
  const conditionPercent = hasCondition ? getConditionPercent(normalizedConditionScore) : 0;
  const conditionLabel = hasCondition ? getConditionLabel(normalizedConditionScore, product.conditionStatus ?? undefined) : "";
  const conditionColor = hasCondition ? getConditionColor(normalizedConditionScore) : "transparent";
  const showNewBadge = !isPerfume && hasCondition && normalizedConditionScore >= 10;

  return (
    <div className="space-y-6">
      <h1 className="text-base md:text-lg uppercase tracking-wider font-semibold leading-tight">{product.name}</h1>

      <div className="flex items-center gap-3">
        <p className="text-base font-medium">{formatTndPrice(product.price)}</p>
        {showNewBadge && (
          <span className="text-[10px] bg-accent text-background px-2 py-1 uppercase tracking-wider font-semibold">
            New
          </span>
        )}
      </div>

      <div className="border-t border-border-color" />

      {!isPerfume && hasCondition && (
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

      {product.brand && product.brand !== product.storeName && (
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

      {!isPerfume && isColorwayProduct && uniqueColors.length > 0 && (
        <div>
          <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">Colorways</p>
          <div className="flex flex-wrap gap-2">
            {uniqueColors.map((color) => {
              const variantsOfColor = variants.filter(
                (variant) => variant.color?.hex?.toLowerCase() === color.hex.toLowerCase(),
              );
              const hasStock = variantsOfColor.some(
                (variant) => (variantAvailability?.[variant._id]?.stock ?? variant.stock ?? 0) > 0,
              );
              return (
                <button
                  key={color.hex}
                  type="button"
                  title={color.name || color.hex}
                  onClick={() => handleSelectColorway(color.hex)}
                  className={`w-7 h-7 rounded-full border-2 transition-all duration-200 cursor-pointer ${
                    selectedColorHex?.toLowerCase() === color.hex.toLowerCase()
                      ? "border-foreground scale-110"
                      : "border-transparent hover:border-border-color"
                  } ${!hasStock ? "opacity-40" : ""}`}
                  style={{ backgroundColor: color.hex }}
                />
              );
            })}
          </div>
        </div>
      )}

      {!isPerfume && hasVisibleSizeOptions && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs text-text-secondary uppercase tracking-wider">Sizes</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {variantsForActiveColor.map((variant) => {
              if (!variant.size.trim()) return null;
              const info = variantAvailability?.[variant._id];
              const stockForVariant = info ? info.stock : variant.stock ?? 0;
              const variantAvailable = stockForVariant > 0;
              const reservedElsewhereForVariant = Boolean(info?.reservedElsewhere);
              return (
                <button
                  key={variant._id}
                  type="button"
                  onClick={() => variantAvailable && setSelectedVariantId(variant._id)}
                  disabled={!variantAvailable}
                  className={`min-w-10 border px-3 py-2 text-sm font-medium transition-colors flex flex-col items-center gap-0.5 ${
                    !variantAvailable
                      ? "border-border-color text-text-secondary bg-surface cursor-not-allowed line-through opacity-50"
                      : selectedVariantId === variant._id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border-color text-foreground hover:bg-hover cursor-pointer"
                  }`}
                >
                  <span>{variant.size}</span>
                  {stockForVariant === 0 ? (
                    <span className="text-[9px] uppercase tracking-wide text-text-secondary">Sold out</span>
                  ) : hasHydratedAvailability && reservedElsewhereForVariant ? (
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
            : selectedVariant?.size
              ? selectedVariantStock === 1
                ? `Last one — ${selectedVariant.size}`
                : `Selected size: ${selectedVariant.size}`
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
            disabled={isBlocked || selectedQuantity >= selectedVariantStock}
            className={`w-8 h-8 flex items-center justify-center text-sm transition-colors cursor-pointer ${
              isBlocked || selectedQuantity >= selectedVariantStock ? "text-border-color cursor-not-allowed" : "hover:bg-hover"
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
      {/* Surface unused viewer state for future use; suppress unused warnings. */}
      <span hidden>{ownedReservation ? "1" : ""}{isSoldOut ? "1" : ""}</span>
    </div>
  );
}
