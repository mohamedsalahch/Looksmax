"use client";

export type StudioZoneId = "headwear" | "outerwear" | "top" | "bottom" | "footwear";

export interface StudioAssignmentItem {
  id: string;
  name: string;
  categories?: string[];
  image?: string;
  price?: string;
  brand?: string;
  quantity?: number;
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
  preferredZoneId?: StudioZoneId;
}

const STORAGE_KEY = "looksmax-studio-pending-assignments";
const EVENT_NAME = "looksmax:studio-assignment-change";

const ZONE_KEYWORDS: Record<StudioZoneId, string[]> = {
  headwear: ["headwear", "hat", "hats", "cap", "caps", "beanie", "beanies", "bag", "bags", "handbag", "handbags", "purse", "purses"],
  outerwear: ["outerwear", "jacket", "jackets", "coat", "coats", "blazer", "blazers", "veste", "vestes"],
  top: ["top", "tops", "shirt", "shirts", "pull", "pulls", "hoodie", "hoodies", "sweater", "sweaters", "tee", "t-shirt", "tshirts", "polo", "polos"],
  bottom: ["bottom", "bottoms", "pant", "pants", "jean", "jeans", "trouser", "trousers", "short", "shorts"],
  footwear: ["shoe", "shoes", "sneaker", "sneakers", "footwear", "boot", "boots", "loafer", "loafers"],
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function readAssignments(): StudioAssignmentItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as StudioAssignmentItem[]).filter((item) => item.productType !== "perfume");
  } catch {
    return [];
  }
}

function writeAssignments(items: StudioAssignmentItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: items }));
}

export function inferStudioAssignmentZone(
  item: Pick<StudioAssignmentItem, "categories" | "name" | "fashionSubtype">
) {
  if (item.fashionSubtype === "shoes") return "footwear";

  const haystack = normalizeText([item.name, ...(item.categories || [])].filter(Boolean).join(" "));

  for (const zoneId of ["headwear", "outerwear", "top", "bottom", "footwear"] as const) {
    if (ZONE_KEYWORDS[zoneId].some((keyword) => haystack.includes(keyword))) {
      return zoneId;
    }
  }

  return "outerwear";
}

export function queueStudioAssignment(item: StudioAssignmentItem) {
  if (typeof window === "undefined") return;
  const zoneId = item.preferredZoneId || inferStudioAssignmentZone(item);
  const current = readAssignments();

  writeAssignments([
    ...current.filter((entry) => entry.id !== item.id),
    {
      ...item,
      preferredZoneId: zoneId,
    },
  ]);
}

export function consumeStudioAssignments() {
  const assignments = readAssignments();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: [] }));
  }
  return assignments;
}

