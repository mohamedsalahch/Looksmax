"use client";

export interface StudioRailItem {
  id: string;
  name: string;
  categories?: string[];
  image?: string;
  price: string;
  brand: string;
  quantity: number;
  maxStock?: number;
  productType?: "fashion" | "perfume" | "clothing" | "shoes";
  fashionSubtype?: "clothes" | "shoes" | null;
  size?: string;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
  reservationExpiresAt?: string | null;
}

const STORAGE_KEY = "looksmax-studio-rail";
const EVENT_NAME = "looksmax:studio-rail-change";

function readItems(): StudioRailItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as StudioRailItem[]).filter(
      (item) => item.productType !== "perfume"
    );
  } catch {
    return [];
  }
}

function writeItems(items: StudioRailItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: items }));
}

export function getStudioRailItems() {
  return readItems();
}

export function addStudioRailItem(item: StudioRailItem) {
  if (item.productType === "perfume") return;

  const current = readItems();
  const exists = current.some((entry) => entry.id === item.id);
  if (exists) {
    writeItems(
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              image: item.image || entry.image,
              name: item.name || entry.name,
              categories: item.categories ?? entry.categories,
              brand: item.brand || entry.brand,
              price: item.price || entry.price,
              quantity: item.quantity || entry.quantity,
              maxStock: item.maxStock ?? entry.maxStock,
              productType: item.productType ?? entry.productType,
              fashionSubtype: item.fashionSubtype ?? entry.fashionSubtype,
              size: item.size ?? entry.size,
              originPictures: item.originPictures ?? entry.originPictures,
              reservationExpiresAt:
                item.reservationExpiresAt ?? entry.reservationExpiresAt ?? null,
            }
          : entry
      )
    );
    return;
  }

  writeItems([...current, item]);
}

export function removeStudioRailItem(id: string) {
  writeItems(readItems().filter((item) => item.id !== id));
}

export function clearStudioRailItems() {
  writeItems([]);
}

export function replaceStudioRailItems(items: StudioRailItem[]) {
  writeItems(items.filter((item) => item.productType !== "perfume"));
}

export function subscribeToStudioRail(listener: (items: StudioRailItem[]) => void) {
  if (typeof window === "undefined") return () => {};

  const handleChange = (event: Event) => {
    const customEvent = event as CustomEvent<StudioRailItem[]>;
    listener(customEvent.detail || readItems());
  };

  const handleStorage = () => listener(readItems());

  window.addEventListener(EVENT_NAME, handleChange as EventListener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(EVENT_NAME, handleChange as EventListener);
    window.removeEventListener("storage", handleStorage);
  };
}
