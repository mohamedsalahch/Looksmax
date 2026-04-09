"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/providers/CartContext";
import { formatTndPrice } from "@/lib/formatPrice";
import {
  addStudioRailItem,
  clearStudioRailItems,
  getStudioRailItems,
  removeStudioRailItem,
  replaceStudioRailItems,
  StudioRailItem,
  subscribeToStudioRail,
} from "@/lib/studioRail";
import {
  formatRemainingTime,
  getReservationKey,
  reserveProduct,
  subscribeToReservationChanges,
} from "@/lib/reservations";

export default function ProductRailTray() {
  const { addItem } = useCart();
  const pathname = usePathname();
  const [railItems, setRailItems] = useState<StudioRailItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const railItemsRef = useRef<StudioRailItem[]>([]);

  useEffect(() => {
    setRailItems(getStudioRailItems());
    return subscribeToStudioRail(setRailItems);
  }, []);

  useEffect(() => {
    railItemsRef.current = railItems;
  }, [railItems]);

  useEffect(() => {
    const handleOpen = () => setCollapsed(false);
    window.addEventListener("looksmax:studio-rail-open", handleOpen as EventListener);
    return () => {
      window.removeEventListener("looksmax:studio-rail-open", handleOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  const railItemIdsKey = useMemo(
    () => railItems.map((item) => item.id.split("-")[0]).sort().join("|"),
    [railItems]
  );

  useEffect(() => {
    if (collapsed || railItems.length === 0) return;

    const hasReservations = railItems.some((item) => item.reservationExpiresAt);
    if (!hasReservations) return;

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [collapsed, railItems]);

  useEffect(() => {
    if (railItemIdsKey.length === 0) return;

    let cancelled = false;

    const syncRailAvailability = () => {
      const currentRailItems = railItemsRef.current;
      if (currentRailItems.length === 0) return;

      fetch("/api/cart/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: currentRailItems.map((item) => item.id.split("-")[0]),
          reservationKey: getReservationKey(),
          mode: "rail",
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (cancelled || !Array.isArray(data.items)) return;

          type AvailabilityItem = {
            productId: string;
            available: boolean;
            reservationExpiresAt?: string | null;
          };

          const availabilityMap = new Map<string, AvailabilityItem>(
            data.items.map((item: AvailabilityItem) => [item.productId, item])
          );

          const nextItems = currentRailItems
            .filter((item) => availabilityMap.get(item.id.split("-")[0])?.available)
            .map((item) => {
              const availability = availabilityMap.get(item.id.split("-")[0]);
              return {
                ...item,
                reservationExpiresAt: availability?.reservationExpiresAt ?? null,
              };
            });

          if (JSON.stringify(nextItems) !== JSON.stringify(currentRailItems)) {
            replaceStudioRailItems(nextItems);
          }
        })
        .catch(() => {});
    };

    syncRailAvailability();
    const interval = window.setInterval(syncRailAvailability, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [railItemIdsKey]);

  useEffect(() => {
    return subscribeToReservationChanges(({ productId, reservationExpiresAt }) => {
      replaceStudioRailItems(
        getStudioRailItems().map((item) =>
          item.id.split("-")[0] === productId
            ? { ...item, reservationExpiresAt }
            : item
        )
      );
      setNowMs(Date.now());
    });
  }, []);

  const handleAddRailItemToCart = async (item: StudioRailItem) => {
    const isPerfume = item.productType === "perfume";

    if (isPerfume) {
        addItem({
          id: item.id,
          name: item.name,
          categories: item.categories,
          price: item.price,
          brand: item.brand || "LOOKSMAX",
        maxStock: Math.max(1, item.maxStock ?? item.quantity ?? 1),
        image: item.image,
        productType: item.productType,
        fashionSubtype: item.fashionSubtype,
        originPictures: item.originPictures,
      });
      return;
    }

    try {
      const reservation = await reserveProduct(item.id);
      addItem({
        id: item.id,
        name: item.name,
        categories: item.categories,
        price: item.price,
        brand: item.brand || "LOOKSMAX",
        maxStock: 1,
        image: item.image,
        size: item.size,
        productType: item.productType ?? "fashion",
        fashionSubtype: item.fashionSubtype,
        originPictures: item.originPictures,
        reservationExpiresAt: reservation.reservationExpiresAt,
      });
      addStudioRailItem({
        ...item,
        reservationExpiresAt: reservation.reservationExpiresAt,
      });
    } catch {
      // Server-side availability remains the final authority.
    }
  };

  const handleAssignToStudio = (item: StudioRailItem) => {
    if (!pathname?.startsWith("/studio")) return;
    window.dispatchEvent(new CustomEvent("looksmax:studio-assign-item", { detail: item }));
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed right-4 bottom-4 z-40 border border-border-color bg-background/95 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-text-secondary shadow-2xl backdrop-blur-sm hover:text-foreground transition-colors"
      >
        Product Rail
      </button>
    );
  }

  return (
    <aside className="fixed right-4 bottom-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] border border-border-color bg-background/95 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border-color px-4 py-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Product Rail
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {railItems.length > 0 && (
            <button
              type="button"
              onClick={clearStudioRailItems}
              className="text-[10px] uppercase tracking-[0.2em] text-text-secondary hover:text-foreground transition-colors"
            >
              Clear All
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="text-text-secondary hover:text-foreground transition-colors"
            aria-label="Hide product rail"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="max-h-[26rem] overflow-y-auto p-3 space-y-3">
        {railItems.map((item) => {
          const reservationLabel =
            nowMs === null ? null : formatRemainingTime(item.reservationExpiresAt, nowMs);

          return (
            <div
              key={item.id}
              draggable
              onClick={() => handleAssignToStudio(item)}
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/json",
                  JSON.stringify({
                    id: item.id,
                    name: item.name,
                    image: item.image,
                    fashionSubtype: item.fashionSubtype,
                    originPictures: item.originPictures,
                  })
                );
              }}
              className={`border border-border-color p-3 active:cursor-grabbing bg-background hover:bg-hover transition-colors ${
                pathname?.startsWith("/studio") ? "cursor-pointer" : "cursor-grab"
              }`}
            >
              <div className="flex gap-3">
                <div className="h-20 w-16 border border-border-color bg-hover shrink-0 overflow-hidden">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{item.name}</p>
                  <p className="text-xs text-text-secondary mt-1">
                    {formatTndPrice(item.price)}
                  </p>
                  <p className="text-[10px] text-text-secondary mt-2 truncate uppercase tracking-wider">
                    {item.brand || "LOOKSMAX"}
                  </p>
                  {reservationLabel ? (
                    <p className="text-[10px] text-foreground mt-1 uppercase tracking-wider">
                      Held {reservationLabel}
                    </p>
                  ) : (
                    <p className="text-[10px] text-text-secondary mt-1 truncate uppercase tracking-wider">
                      Qty {item.quantity}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleAddRailItemToCart(item);
                      }}
                      disabled={Boolean(reservationLabel)}
                      className={`text-[10px] uppercase tracking-[0.22em] underline underline-offset-4 transition-colors cursor-pointer ${
                        reservationLabel
                          ? "text-text-secondary/50 cursor-not-allowed no-underline"
                          : "text-text-secondary hover:text-foreground"
                      }`}
                    >
                      Move To Cart
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeStudioRailItem(item.id);
                      }}
                      className="text-[10px] uppercase tracking-[0.22em] text-text-secondary underline underline-offset-4 hover:text-foreground transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {railItems.length === 0 && (
          <div className="border border-dashed border-border-color p-5 text-center text-xs text-text-secondary">
            Add products from the cart or product pages to build your rail.
          </div>
        )}
      </div>
    </aside>
  );
}
