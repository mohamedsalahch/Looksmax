"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from "react";
import {
  clearReservationKey,
  getReservationKey,
  getStoredReservationKey,
  releaseAllReservations,
  releaseProductReservation,
  reserveProduct,
} from "@/lib/reservations";
import { buildCartItemId, getCartItemProductId } from "@/lib/cartItem";
import { subscribeToAvailabilityStream } from "@/lib/availabilityStream";

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
  hydrated: boolean;
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
const CART_ITEM_REMOVED_EVENT = "looksmax:cart-item-removed";
const CART_CLEARED_EVENT = "looksmax:cart-cleared";

function notifyStudioCartItemRemoved(item?: CartItem) {
  if (typeof window === "undefined" || !item) return;

  window.dispatchEvent(
    new CustomEvent(CART_ITEM_REMOVED_EVENT, {
      detail: {
        cartItemId: item.id,
        productId: getCartItemProductId(item.id),
        size: item.size || null,
      },
    })
  );
}

function notifyStudioCartCleared() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(CART_CLEARED_EVENT));
}

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

function getCartVariantQuantity(items: CartItem[], productId: string, size?: string) {
  return items.reduce((sum, item) => {
    if (getCartItemProductId(item.id) !== productId) return sum;
    if ((item.size || "") !== (size || "")) return sum;
    return sum + Math.max(1, item.quantity || 1);
  }, 0);
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const itemsRef = useRef<CartItem[]>([]);
  const emptiedReservationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const syncCartAvailability = useCallback(() => {
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
        if (!Array.isArray(data.items)) return;

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
          sizeAvailability?: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null;
        };

        const availabilityMap = new Map(
          data.items.map((item: AvailabilityItem) => [item.productId, item])
        ) as Map<string, AvailabilityItem>;

        setItems((currentItems) => {
          const removedItems: CartItem[] = [];
          const nextItems = currentItems.flatMap((item) => {
            const productId = getCartItemProductId(item.id);
            const availability = availabilityMap.get(productId);
            const sizeInfo =
              item.size && availability?.sizeAvailability
                ? availability.sizeAvailability[item.size]
                : undefined;
            const maxStock = Math.max(1, sizeInfo?.stock ?? availability?.maxStock ?? item.maxStock ?? 1);
            const ownedReservation = Boolean(availability?.ownedReservation);

            const isSizeSoldOut = sizeInfo !== undefined && sizeInfo !== null && sizeInfo.stock <= 0;
            const isProductSoldOut = Boolean(availability?.blockedByOrder || !availability?.available);
            const isUnavailable = availability
              ? (!availability.available && !ownedReservation) || Boolean(item.isUnavailable)
              : Boolean(item.isUnavailable);
            const soldOut = isSizeSoldOut || isProductSoldOut;

            if (soldOut) {
              removedItems.push(item);
              return [];
            }

            const unavailableReason = isUnavailable
              ? "This product is currently unavailable."
              : null;

            return {
              ...item,
              image: item.image || availability?.image,
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

          removedItems.forEach((item) => {
            releaseProductReservation(getCartItemProductId(item.id), item.size).catch(() => {});
          });

          return nextItems;
        });
      })
      .catch(() => {});
  }, []);

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
    if (!hydrated) return;

    if (items.length > 0) {
      emptiedReservationKeyRef.current = null;
      return;
    }

    const storedReservationKey = getStoredReservationKey();
    if (!storedReservationKey || emptiedReservationKeyRef.current === storedReservationKey) {
      return;
    }

    emptiedReservationKeyRef.current = storedReservationKey;
    void releaseAllReservations().catch(() => {});
  }, [hydrated, items.length]);

  // Initial sync + re-sync on focus. SSE handles real-time updates (see effect below).
  const hasCartItems = items.length > 0;
  useEffect(() => {
    if (!hydrated || !hasCartItems) return;

    syncCartAvailability();

    const handleFocus = () => syncCartAvailability();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [hydrated, hasCartItems, syncCartAvailability]);

  // Subscribe to SSE — sync cart when a reserved product changes, and on reconnect.
  useEffect(() => {
    if (!hydrated) return;

    const unsubscribe = subscribeToAvailabilityStream(
      (event) => {
        const isCartProduct = itemsRef.current.some(
          (item) => getCartItemProductId(item.id) === event.productId
        );
        if (isCartProduct) syncCartAvailability();
      },
      () => syncCartAvailability(),
    );

    return unsubscribe;
  }, [hydrated, syncCartAvailability]);

  useEffect(() => {
    if (!hydrated || items.length === 0) return;

    const quantitiesByProductAndSize = new Map<string, { productId: string; quantity: number; size?: string }>();
    items.forEach((item) => {
      const productId = getCartItemProductId(item.id);
      const key = `${productId}:${item.size || ""}`;
      const current = quantitiesByProductAndSize.get(key) || { productId, quantity: 0, size: item.size };
      current.quantity += Math.max(1, item.quantity || 1);
      quantitiesByProductAndSize.set(key, current);
    });

    quantitiesByProductAndSize.forEach(({ productId, quantity, size }) => {
      void reserveProduct(productId, quantity, size).catch(() => {});
    });
  }, [hydrated, items]);

  useEffect(() => {
    if (!hydrated || items.length === 0) return;

    let cancelled = false;

    const sweepExpiredReservations = () => {
      if (cancelled) return;

      const now = Date.now();
      const expiredItems = itemsRef.current.filter((item) => {
        if (!item.reservationExpiresAt) return false;
        return new Date(item.reservationExpiresAt).getTime() <= now;
      });

      if (expiredItems.length === 0) return;

      const expiredIds = new Set(expiredItems.map((item) => item.id));
      setItems((current) => current.filter((item) => !expiredIds.has(item.id)));
      expiredItems.forEach((item) => {
        void releaseProductReservation(getCartItemProductId(item.id), item.size);
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

      void reserveProduct(
        productId,
        getCartVariantQuantity(nextItemsSnapshot, productId, newItem.size),
        newItem.size
      ).catch(() => {});
      if (options?.openCart !== false) {
        setIsOpen(true); // Open cart when adding
      }
    },
    []
  );

  const removeItem = useCallback((id: string) => {
    const productId = getCartItemProductId(id);
    let nextItemsSnapshot: CartItem[] = [];
    let removedItem: CartItem | undefined;
    setItems((prev) => {
      const nextItems = prev.filter((item) => item.id !== id);
      nextItemsSnapshot = nextItems;
      removedItem = prev.find((item) => item.id === id);
      return nextItems;
    });
    const nextQuantity = getCartVariantQuantity(nextItemsSnapshot, productId, removedItem?.size);
    if (nextQuantity > 0) {
      void reserveProduct(productId, nextQuantity, removedItem?.size).catch(() => {});
    } else {
      void releaseProductReservation(productId, removedItem?.size);
    }
    notifyStudioCartItemRemoved(removedItem);
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    const productId = getCartItemProductId(id);
    let currentItem: CartItem | undefined;
    let nextItemsSnapshot: CartItem[] = [];
    if (quantity <= 0) {
      setItems((prev) => {
        const nextItems = prev.filter((item) => item.id !== id);
        nextItemsSnapshot = nextItems;
        currentItem = prev.find((item) => item.id === id);
        return nextItems;
      });
      const nextQuantity = getCartVariantQuantity(nextItemsSnapshot, productId, currentItem?.size);
      if (nextQuantity > 0) {
        void reserveProduct(productId, nextQuantity, currentItem?.size).catch(() => {});
      } else {
        void releaseProductReservation(productId, currentItem?.size);
      }
      notifyStudioCartItemRemoved(currentItem);
      return;
    }
    setItems((prev) => {
      const nextItems = prev.map((item) => {
        if (item.id === id) {
          currentItem = item;
          return { ...item, quantity: Math.min(quantity, item.maxStock) };
        }
        return item;
      });
      nextItemsSnapshot = nextItems;
      return nextItems;
    });
    void reserveProduct(
      productId,
      getCartVariantQuantity(nextItemsSnapshot, productId, currentItem?.size),
      currentItem?.size
    ).catch(() => {});
  }, []);

  const clearCart = useCallback(() => {
    itemsRef.current.forEach((item) => {
      const productId = getCartItemProductId(item.id);
      void releaseProductReservation(productId, item.size);
    });
    clearReservationKey();
    setItems([]);
    notifyStudioCartCleared();
  }, []);

  useEffect(() => {
    const handleAuthLogout = () => {
      clearCart();
    };

    window.addEventListener("looksmax-auth-logout", handleAuthLogout as EventListener);
    return () => window.removeEventListener("looksmax-auth-logout", handleAuthLogout as EventListener);
  }, [clearCart]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + parseFloat(item.price) * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        hydrated,
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
