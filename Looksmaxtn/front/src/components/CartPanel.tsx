"use client";

import { useCart } from "@/providers/CartContext";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRemainingTime } from "@/lib/reservations";
import { formatTndPrice } from "@/lib/formatPrice";
import { getCartItemProductId } from "@/lib/cartItem";

export default function CartPanel() {
  const { items, isOpen, openCart, closeCart, removeItem, updateQuantity, totalItems, totalPrice } =
    useCart();
  const router = useRouter();
  const hasUnavailableItems = items.some((item) => item.isUnavailable);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, closeCart]);

  useEffect(() => {
    if (!isOpen) return;

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isOpen]);

  if (!mounted) {
    return null;
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-50 panel-overlay transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeCart}
      />

      {/* Panel — slides from right */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md z-50 bg-background shadow-2xl transition-panel flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color">
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Cart ({totalItems})
          </h2>
          <button
            onClick={closeCart}
            className="text-foreground hover:text-text-secondary transition-colors cursor-pointer"
            aria-label="Close cart"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-border-color mb-4">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <p className="text-sm text-text-secondary mb-1">Your cart is empty</p>
              <p className="text-xs text-text-secondary/70 mb-6">
                Browse our collection and find something you love.
              </p>
              <button
                onClick={closeCart}
                className="text-xs uppercase tracking-wider font-medium text-foreground underline underline-offset-4 hover:text-text-secondary transition-colors cursor-pointer"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border-color">
              {items.map((item) => {
                const remainingTime = item.reservationExpiresAt
                  ? formatRemainingTime(item.reservationExpiresAt, nowMs)
                  : null;

                return (
                  <div key={item.id} className="flex gap-4 px-6 py-5">
                    <div className="w-20 h-24 shrink-0 overflow-hidden bg-surface">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-full h-full placeholder-img">
                          <span className="relative z-10 text-[7px] tracking-wider opacity-50">
                            IMG
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                            {item.brand}
                          </p>
                          <Link
                            href={`/product/${getCartItemProductId(item.id)}`}
                            onClick={closeCart}
                            className="text-sm font-medium hover:text-text-secondary transition-colors line-clamp-1"
                          >
                            {item.name}
                          </Link>
                          {remainingTime && (
                            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#7a8362]">
                              Hold expires in {remainingTime}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            removeItem(item.id);
                          }}
                          className="text-text-secondary hover:text-foreground transition-colors cursor-pointer shrink-0 mt-0.5"
                          aria-label={`Remove ${item.name}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>

                      {item.isUnavailable && (
                        <p className="mt-1 text-[10px] text-[#430C05]">
                          {item.unavailableReason || "This product is already taken. Remove it manually."}
                        </p>
                      )}

                      {(item.size || item.color || item.productType === "perfume") && (
                        <div className="flex items-center gap-2 mt-1">
                          {item.productType === "perfume" ? (
                            <span className="text-[10px] text-text-secondary uppercase tracking-wider">
                              Fragrance
                            </span>
                          ) : (
                            <>
                              {item.size && <span className="text-[10px] text-text-secondary">{item.size}</span>}
                              {item.size && item.color && <span className="text-[10px] text-text-secondary">·</span>}
                              {item.color && <span className="text-[10px] text-text-secondary">{item.color}</span>}
                            </>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              if (item.quantity === 1) {
                                updateQuantity(item.id, 0);
                                return;
                              }
                              updateQuantity(item.id, item.quantity - 1);
                            }}
                            className="text-sm leading-none text-text-secondary hover:text-foreground transition-colors cursor-pointer"
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className="min-w-[1.25rem] text-center text-xs font-medium tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            disabled={item.quantity >= item.maxStock}
                            className={`text-sm leading-none transition-colors cursor-pointer ${
                              item.quantity >= item.maxStock
                                ? "text-border-color cursor-not-allowed"
                                : "text-text-secondary hover:text-foreground"
                            }`}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>

                        <p className="text-sm font-medium">
                          {formatTndPrice(parseFloat(item.price) * item.quantity)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — only show when there are items */}
        {items.length > 0 && (
          <div className="border-t border-border-color px-6 py-5 space-y-4">
            {/* Subtotal */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                Subtotal
              </span>
              <span className="text-lg font-semibold">{formatTndPrice(totalPrice)}</span>
            </div>

            <p className="text-[10px] text-text-secondary">
              Shipping & taxes calculated at checkout.
            </p>

            {/* Checkout button */}
            <Link
              href="/checkout"
              onClick={(e) => {
                if (hasUnavailableItems) {
                  e.preventDefault();
                  return;
                }
                closeCart();
              }}
              aria-disabled={hasUnavailableItems}
              className={`block w-full py-3.5 text-sm font-medium tracking-wide uppercase transition-colors text-center ${
                hasUnavailableItems
                  ? "bg-border-color text-text-secondary cursor-not-allowed"
                  : "bg-foreground text-background hover:bg-accent cursor-pointer"
              }`}
              >
              {hasUnavailableItems ? "Remove Taken Items" : "Proceed to Checkout"}
            </Link>

            <button
              type="button"
              onClick={() => {
                const firstTryOnItem = items.find((item) => item.productType !== "perfume");
                if (!firstTryOnItem) return;

                const { queueStudioAssignment } = require("@/lib/studioAssignment");
                queueStudioAssignment({
                  id: firstTryOnItem.id,
                  name: firstTryOnItem.name,
                  categories: firstTryOnItem.categories,
                  image: firstTryOnItem.image,
                  price: firstTryOnItem.price,
                  brand: firstTryOnItem.brand,
                  quantity: firstTryOnItem.quantity,
                  maxStock: firstTryOnItem.maxStock,
                  productType: firstTryOnItem.productType,
                  fashionSubtype: firstTryOnItem.fashionSubtype,
                  size: firstTryOnItem.size,
                  originPictures: firstTryOnItem.originPictures,
                });
                closeCart();
                router.push("/studio");
              }}
              className="block w-full border border-border-color bg-surface/40 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-foreground transition-colors hover:bg-surface/70 cursor-pointer"
            >
              TRY ON
            </button>

            {/* Continue shopping */}
            <button
              onClick={closeCart}
              className="w-full text-center text-[10px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-foreground hover:decoration-foreground cursor-pointer"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </>
  );
}
