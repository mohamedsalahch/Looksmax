"use client";

export interface StudioTryOnItem {
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

const STORAGE_KEY = "looksmax-try-on-picks";
const LEGACY_STORAGE_KEY = ["looksmax", "studio", "r" + "ail"].join("-");
const EVENT_NAME = "looksmax:try-on-picks-change";
const LEGACY_EVENT_NAME = ["looksmax:studio", "r" + "ail", "change"].join("-");

function readItems(): StudioTryOnItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as StudioTryOnItem[]).filter(
      (item) => item.productType !== "perfume"
    );
  } catch {
    return [];
  }
}

function writeItems(items: StudioTryOnItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: items }));
  window.dispatchEvent(new CustomEvent(LEGACY_EVENT_NAME, { detail: items }));
}

export function getStudioTryOnItems() {
  return readItems();
}

export function addStudioTryOnItem(item: StudioTryOnItem) {
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

export function removeStudioTryOnItem(id: string) {
  writeItems(readItems().filter((item) => item.id !== id));
}

export function clearStudioTryOnItems() {
  writeItems([]);
}

export function replaceStudioTryOnItems(items: StudioTryOnItem[]) {
  writeItems(items.filter((item) => item.productType !== "perfume"));
}

export function subscribeToStudioTryOn(listener: (items: StudioTryOnItem[]) => void) {
  if (typeof window === "undefined") return () => {};

  const handleChange = (event: Event) => {
    const customEvent = event as CustomEvent<StudioTryOnItem[]>;
    listener(customEvent.detail || readItems());
  };

  const handleStorage = () => listener(readItems());

  window.addEventListener(EVENT_NAME, handleChange as EventListener);
  window.addEventListener(LEGACY_EVENT_NAME, handleChange as EventListener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(EVENT_NAME, handleChange as EventListener);
    window.removeEventListener(LEGACY_EVENT_NAME, handleChange as EventListener);
    window.removeEventListener("storage", handleStorage);
  };
}
