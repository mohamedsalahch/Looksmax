"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/providers/CartContext";
import { getCartItemProductId } from "@/lib/cartItem";
import { reserveProduct } from "@/lib/reservations";
import { formatTndPrice } from "@/lib/formatPrice";
import { getConditionColor, getConditionLabel, getConditionPercent } from "@/lib/productCondition";
import { queueStudioAssignment } from "@/lib/studioAssignment";

type ProductType = "fashion" | "perfume" | "clothing" | "shoes";

export default function ProductInfo({
  product,
}: {
  product: {
    id?: string;
    name: string;
    categories?: string[];
    price: string;
    brand: string;
    image?: string;
    size?: string;
    sizes?: string[];
    stock: number;
    description: string;
    reservationExpiresAt?: string | null;
    cartCount?: number;
    reservedElsewhere?: boolean;
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
  }) {
  const [addedToCart, setAddedToCart] = useState(false);
  const [currentStock, setCurrentStock] = useState(() => product.stock);
  const [reservationError, setReservationError] = useState("");
  const [reservedElsewhere, setReservedElsewhere] = useState(() => Boolean(product.reservedElsewhere));
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const availableSizes = (product.sizes?.length ? product.sizes : product.size ? [product.size] : []).filter(
    (entry) => Boolean(entry.trim())
  );
  const [selectedSize, setSelectedSize] = useState(() => availableSizes[0] || "");
  const { addItem, items } = useCart();
  const router = useRouter();
  const isPerfume = product.productType === "perfume";
  const isSoldOut = currentStock < 1;
  const isInLocalCart = product.id ? items.some((item) => getCartItemProductId(item.id) === product.id) : false;
  const showReservedElsewhere = reservedElsewhere && !isInLocalCart;

  useEffect(() => {
    if (!product.id) return;

    let cancelled = false;

    const refreshAvailability = () => {
      fetch(`/api/products/${product.id}`)
        .then((response) => response.json())
        .then((data) => {
          if (cancelled || !data.product) return;
          setCurrentStock(data.product.stock ?? 0);
          setReservedElsewhere(Boolean(data.product.reservedElsewhere));
        })
        .catch(() => {});
    };

    const interval = window.setInterval(refreshAvailability, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [product.id]);

  useEffect(() => {
    setSelectedQuantity((current) => Math.min(Math.max(1, current), Math.max(1, currentStock)));
  }, [currentStock]);

  useEffect(() => {
    if (availableSizes.length === 0) {
      setSelectedSize("");
      return;
    }

    setSelectedSize((current) => (availableSizes.includes(current) ? current : availableSizes[0]));
  }, [availableSizes.join("|")]);

  useEffect(() => {
    setReservedElsewhere(Boolean(product.reservedElsewhere));
  }, [product.reservedElsewhere]);

  const handleAddToCart = async () => {
    setReservationError("");
    if (isSoldOut) return;

    try {
      const reservation = await reserveProduct(product.id || "unknown");
      addItem({
        id: product.id || "unknown",
        name: product.name,
        price: product.price,
        brand: product.brand,
        image: product.image,
        categories: product.categories,
        size: isPerfume ? undefined : selectedSize,
        maxStock: Math.max(1, currentStock),
        productType: product.productType,
        fashionSubtype: product.fashionSubtype,
        originPictures: product.originPictures,
        reservationExpiresAt: reservation.reservationExpiresAt,
        cartCount: reservation.cartCount,
        quantity: selectedQuantity,
      }, { openCart: false });
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    } catch (error) {
      setReservationError(error instanceof Error ? error.message : "Unable to add this product to your cart.");
    }
  };

  const handleAddToTryOn = async () => {
    if (isSoldOut || isPerfume) return;

    try {
      const reservation = await reserveProduct(product.id || "unknown");
      addItem({
        id: product.id || "unknown",
        name: product.name,
        price: product.price,
        brand: product.brand,
        image: product.image,
        categories: product.categories,
        size: isPerfume ? undefined : selectedSize,
        maxStock: Math.max(1, currentStock),
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
        maxStock: Math.max(1, currentStock),
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
      <p className="text-xs text-text-secondary uppercase tracking-widest">{product.brand}</p>

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
            {availableSizes.map((sizeOption) => (
              <button
                key={sizeOption}
                type="button"
                onClick={() => setSelectedSize(sizeOption)}
                className={`min-w-10 border px-3 py-2 text-sm font-medium transition-colors ${
                  selectedSize === sizeOption
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-color text-foreground hover:bg-hover"
                }`}
              >
                {sizeOption}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#7A8362]" />
        <span className="text-xs text-text-secondary">
          {isPerfume
            ? `${currentStock} bottle${currentStock !== 1 ? "s" : ""} available`
            : currentStock === 1
              ? "Last one — only 1 in stock"
              : `${currentStock} in stock`}
        </span>
      </div>

      {showReservedElsewhere && (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-foreground" />
          <span className="text-xs text-text-secondary">Reserved elsewhere</span>
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
            onClick={() => setSelectedQuantity((current) => Math.max(1, current - 1))}
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
            onClick={() =>
              setSelectedQuantity((current) => Math.min(Math.max(1, current + 1), Math.max(1, currentStock)))
            }
            disabled={selectedQuantity >= currentStock}
            className={`w-8 h-8 flex items-center justify-center text-sm transition-colors cursor-pointer ${
              selectedQuantity >= currentStock ? "text-border-color cursor-not-allowed" : "hover:bg-hover"
            }`}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleAddToCart}
            disabled={isSoldOut}
            className={`w-full py-3.5 text-sm font-medium tracking-wide uppercase transition-all duration-300 cursor-pointer ${
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
              ? "✓ Added to Cart"
              : "Add to Cart"}
        </button>
        {!isPerfume && (
          <button
            type="button"
            onClick={handleAddToTryOn}
            disabled={isSoldOut}
            className={`w-full py-3.5 text-sm font-medium tracking-wide uppercase transition-all duration-300 cursor-pointer ${
              isSoldOut
                ? "border border-border-color text-text-secondary cursor-not-allowed"
                : "border border-border-color text-foreground hover:bg-hover"
            }`}
          >
            TRY ON
          </button>
        )}
      </div>

      <div className="border-t border-border-color" />

      <div>
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">Description</p>
        <p className="text-sm leading-relaxed text-foreground/80">{product.description}</p>
      </div>
    </div>
  );
}
