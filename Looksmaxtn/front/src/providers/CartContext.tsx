"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo, useRef } from "react";
import { getReservationKey, releaseProductReservation } from "@/lib/reservations";

export interface CartItem {
  id: string;
  name: string;
  categories?: string[];
  price: string;
  brand: string;
  size?: string;
  color?: string;
  productType?: "fashion" | "perfume" | "clothing" | "shoes";
  fashionSubtype?: "clothes" | "shoes" | null;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
  quantity: number;
  maxStock: number;
  image?: string;
  reservationExpiresAt?: string | null;
  isUnavailable?: boolean;
  unavailableReason?: string | null;
  cartCount?: number;
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addItem: (
    item: Omit<CartItem, "quantity"> & { quantity?: number },
    options?: { openCart?: boolean }
  ) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const STORAGE_KEY = "looksmax-cart";

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    return (JSON.parse(stored) as CartItem[]).map((item) => ({
      ...item,
      id: item.id.split("-")[0],
      quantity: Math.max(1, item.quantity || 1),
      maxStock: Math.max(1, item.maxStock || 1),
    }));
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const itemsRef = useRef<CartItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Load cart from localStorage on mount (client-side only)
  useEffect(() => {
    const nextItems = loadCart();
    queueMicrotask(() => {
      setItems(nextItems);
      setHydrated(true);
    });
  }, []);

  // Persist cart to localStorage whenever items change (after hydration)
  useEffect(() => {
    if (hydrated) {
      saveCart(items);
    }
  }, [items, hydrated]);

  const itemIdsKey = useMemo(
    () => items.map((item) => item.id.split("-")[0]).sort().join("|"),
    [items]
  );

  useEffect(() => {
    if (!hydrated || itemIdsKey.length === 0) return;

    let cancelled = false;

    const syncCartAvailability = () => {
      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      fetch("/api/cart/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: currentItems.map((item) => item.id.split("-")[0]),
          cartKey: getReservationKey(),
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (cancelled || !Array.isArray(data.items)) return;

          type AvailabilityItem = {
            productId: string;
            available: boolean;
            blockedByOrder?: boolean;
            maxStock?: number;
            productType?: "fashion" | "perfume" | "clothing" | "shoes";
            originPictures?: {
              front?: string;
              back?: string;
              left?: string;
              right?: string;
            };
            fashionSubtype?: "clothes" | "shoes" | null;
            image?: string;
            reservationExpiresAt?: string | null;
            cartCount?: number;
          };

          const availabilityMap = new Map(
            data.items.map((item: AvailabilityItem) => [
              item.productId,
              item,
            ])
          ) as Map<string, AvailabilityItem>;

          const removedProductIds = new Set<string>();

          setItems((currentItems) => {
            const nextItems = currentItems.flatMap((item) => {
              const availability = availabilityMap.get(item.id.split("-")[0]);
              const maxStock = Math.max(1, availability?.maxStock ?? item.maxStock ?? 1);
              const isUnavailable = availability ? !availability.available : Boolean(item.isUnavailable);
              const soldOut = Boolean(availability?.blockedByOrder || (availability && !availability.available));

              if (soldOut) {
                removedProductIds.add(item.id.split("-")[0]);
                return [];
              }

              const unavailableReason = isUnavailable
                ? "This product is currently unavailable."
                : null;

              return {
                ...item,
                image: availability?.image || item.image,
                originPictures: availability?.originPictures || item.originPictures,
                reservationExpiresAt: availability?.reservationExpiresAt ?? null,
                maxStock,
                quantity: Math.min(item.quantity, maxStock),
                productType: availability?.productType ?? item.productType,
                fashionSubtype: availability?.fashionSubtype ?? item.fashionSubtype,
                cartCount: availability?.cartCount ?? item.cartCount ?? 0,
                isUnavailable,
                unavailableReason,
              };
            });

            if (JSON.stringify(nextItems) === JSON.stringify(currentItems)) {
              return currentItems;
            }

            return nextItems;
          });

          removedProductIds.forEach((productId) => {
            releaseProductReservation(productId).catch(() => {});
          });
        })
        .catch(() => {});
    };

    syncCartAvailability();
    const interval = window.setInterval(syncCartAvailability, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hydrated, itemIdsKey]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen((prev) => !prev), []);

  const addItem = useCallback(
    (newItem: Omit<CartItem, "quantity"> & { quantity?: number }, options?: { openCart?: boolean }) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.id === newItem.id);
      const nextQuantity = Math.max(1, newItem.quantity ?? 1);
      if (existing) {
        return prev.map((item) =>
          item.id === newItem.id
            ? (() => {
                const nextMaxStock = Math.max(newItem.maxStock ?? item.maxStock, 1);
                return {
                  ...item,
                  name: newItem.name || item.name,
                  brand: newItem.brand || item.brand,
                  image: newItem.image || item.image,
                  categories: newItem.categories ?? item.categories,
                  size: newItem.size ?? item.size,
                  color: newItem.color ?? item.color,
                  productType: newItem.productType ?? item.productType,
                  originPictures: newItem.originPictures ?? item.originPictures,
                  maxStock: nextMaxStock,
                  quantity: Math.min(item.quantity + nextQuantity, nextMaxStock),
                  reservationExpiresAt: newItem.reservationExpiresAt ?? item.reservationExpiresAt ?? null,
                };
              })()
            : item
        );
      }
      return [...prev, { ...newItem, quantity: Math.min(nextQuantity, Math.max(newItem.maxStock, 1)) }];
    });
      if (options?.openCart !== false) {
        setIsOpen(true); // Open cart when adding
      }
    },
    []
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, quantity: Math.min(quantity, item.maxStock) }
          : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    itemsRef.current.forEach((item) => {
      void releaseProductReservation(item.id.split("-")[0]);
    });
    setItems([]);
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + parseFloat(item.price) * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        openCart,
        closeCart,
        toggleCart,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
