"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from "react";
import { getReservationKey, releaseProductReservation, reserveProduct } from "@/lib/reservations";
import { buildCartItemId, getCartItemProductId } from "@/lib/cartItem";

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

    return (JSON.parse(stored) as CartItem[]).map((item) => {
      const productId = getCartItemProductId(item.id);
      return {
        ...item,
        id: buildCartItemId(productId, item.size, item.color),
        quantity: Math.max(1, item.quantity || 1),
        maxStock: Math.max(1, item.maxStock || 1),
      };
    });
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

function getCartProductQuantity(items: CartItem[], productId: string) {
  return items.reduce((sum, item) => {
    if (getCartItemProductId(item.id) !== productId) return sum;
    return sum + Math.max(1, item.quantity || 1);
  }, 0);
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

  useEffect(() => {
    if (!hydrated || items.length === 0) return;

    let cancelled = false;

    const syncCartAvailability = () => {
      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      fetch("/api/cart/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: [...new Set(currentItems.map((item) => getCartItemProductId(item.id)))],
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
            ownedReservation?: boolean;
            reservedElsewhere?: boolean;
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
              const productId = getCartItemProductId(item.id);
              const availability = availabilityMap.get(productId);
              const maxStock = Math.max(1, availability?.maxStock ?? item.maxStock ?? 1);
              const ownedReservation = Boolean(availability?.ownedReservation);
              const reservedElsewhere = Boolean(availability?.reservedElsewhere);
              const isUnavailable = availability
                ? (!availability.available && !ownedReservation) || Boolean(item.isUnavailable)
                : Boolean(item.isUnavailable);
              const soldOut = Boolean(availability?.blockedByOrder || !availability?.available);

              if (soldOut) {
                removedProductIds.add(productId);
                return [];
              }

              const unavailableReason = reservedElsewhere && !ownedReservation
                ? "This product is reserved elsewhere."
                : isUnavailable
                  ? "This product is currently unavailable."
                : null;

              return {
                ...item,
                image: availability?.image || item.image,
                originPictures: availability?.originPictures || item.originPictures,
                reservationExpiresAt: ownedReservation ? availability?.reservationExpiresAt ?? item.reservationExpiresAt ?? null : item.reservationExpiresAt ?? null,
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
  }, [hydrated, items]);

  useEffect(() => {
    if (!hydrated || items.length === 0) return;

    const quantitiesByProduct = new Map<string, number>();
    items.forEach((item) => {
      const productId = getCartItemProductId(item.id);
      quantitiesByProduct.set(productId, (quantitiesByProduct.get(productId) || 0) + Math.max(1, item.quantity || 1));
    });

    quantitiesByProduct.forEach((quantity, productId) => {
      void reserveProduct(productId, quantity).catch(() => {});
    });
  }, [hydrated, items]);

  useEffect(() => {
    if (!hydrated || items.length === 0) return;

    let cancelled = false;

    const sweepExpiredReservations = () => {
      if (cancelled) return;

      const now = Date.now();
      const expiredProductIds = new Set(
        itemsRef.current
          .filter((item) => {
            if (!item.reservationExpiresAt) return false;
            return new Date(item.reservationExpiresAt).getTime() <= now;
          })
          .map((item) => getCartItemProductId(item.id))
      );

      if (expiredProductIds.size === 0) return;

      setItems((current) => current.filter((item) => !expiredProductIds.has(getCartItemProductId(item.id))));
      expiredProductIds.forEach((productId) => {
        void releaseProductReservation(productId);
      });
    };

    sweepExpiredReservations();
    const interval = window.setInterval(sweepExpiredReservations, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hydrated, items]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen((prev) => !prev), []);

  const addItem = useCallback(
    (newItem: Omit<CartItem, "quantity"> & { quantity?: number }, options?: { openCart?: boolean }) => {
      const nextId = buildCartItemId(newItem.id, newItem.size, newItem.color);
      const productId = getCartItemProductId(nextId);
      const nextQuantity = Math.max(1, newItem.quantity ?? 1);
      let nextItemsSnapshot: CartItem[] = [];

      setItems((prev) => {
        const existing = prev.find((item) => item.id === nextId);
        if (existing) {
          const nextItems = prev.map((item) =>
            item.id === nextId
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
          nextItemsSnapshot = nextItems;
          return nextItems;
        }
        const nextItems = [...prev, { ...newItem, id: nextId, quantity: Math.min(nextQuantity, Math.max(newItem.maxStock, 1)) }];
        nextItemsSnapshot = nextItems;
        return nextItems;
      });

      void reserveProduct(productId, getCartProductQuantity(nextItemsSnapshot, productId)).catch(() => {});
      if (options?.openCart !== false) {
        setIsOpen(true); // Open cart when adding
      }
    },
    []
  );

  const removeItem = useCallback((id: string) => {
    const productId = getCartItemProductId(id);
    let nextItemsSnapshot: CartItem[] = [];
    setItems((prev) => {
      const nextItems = prev.filter((item) => item.id !== id);
      nextItemsSnapshot = nextItems;
      return nextItems;
    });
    const nextQuantity = getCartProductQuantity(nextItemsSnapshot, productId);
    if (nextQuantity > 0) {
      void reserveProduct(productId, nextQuantity).catch(() => {});
    } else {
      void releaseProductReservation(productId);
    }
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    const productId = getCartItemProductId(id);
    let nextItemsSnapshot: CartItem[] = [];
    if (quantity <= 0) {
      setItems((prev) => {
        const nextItems = prev.filter((item) => item.id !== id);
        nextItemsSnapshot = nextItems;
        return nextItems;
      });
      const nextQuantity = getCartProductQuantity(nextItemsSnapshot, productId);
      if (nextQuantity > 0) {
        void reserveProduct(productId, nextQuantity).catch(() => {});
      } else {
        void releaseProductReservation(productId);
      }
      return;
    }
    setItems((prev) => {
      const nextItems = prev.map((item) =>
        item.id === id
          ? { ...item, quantity: Math.min(quantity, item.maxStock) }
          : item
      );
      nextItemsSnapshot = nextItems;
      return nextItems;
    });
    void reserveProduct(productId, getCartProductQuantity(nextItemsSnapshot, productId)).catch(() => {});
  }, []);

  const clearCart = useCallback(() => {
    [...new Set(itemsRef.current.map((item) => getCartItemProductId(item.id)))].forEach((productId) => {
      void releaseProductReservation(productId);
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
