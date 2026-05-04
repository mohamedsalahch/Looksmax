export type CategoryGender = "men" | "women" | "unisex";
export type CategoryZone =
  | "top"
  | "bottom"
  | "outerwear"
  | "dress"
  | "footwear"
  | "headwear"
  | "handbag"
  | "other";
export type CompanionZone = "top" | "bottom" | "footwear";

export interface ClassifiableCategory {
  _id?: string;
  name: string;
  slug: string;
  parentSlug?: string | null;
}

const ZONE_PREFIXES: Record<Exclude<CategoryZone, "other">, string> = {
  top: "top-",
  bottom: "bottom-",
  outerwear: "outerwear-",
  dress: "dress-",
  footwear: "footwear-",
  headwear: "headwear-",
  handbag: "handbag-",
};

export function getCategoryAncestors<T extends ClassifiableCategory>(
  categories: T[],
  slug: string
): T[] {
  const chain: T[] = [];
  let cursor = categories.find((category) => category.slug === slug);
  while (cursor) {
    chain.push(cursor);
    if (!cursor.parentSlug) break;
    cursor = categories.find((category) => category.slug === cursor!.parentSlug);
  }
  return chain;
}

export function getCategoryGender<T extends ClassifiableCategory>(
  categories: T[],
  slug: string
): CategoryGender {
  if (!slug) return "unisex";
  const chain = getCategoryAncestors(categories, slug);
  const root = chain[chain.length - 1];
  if (root?.slug === "men") return "men";
  if (root?.slug === "women") return "women";
  if (slug.endsWith("-men")) return "men";
  if (slug.endsWith("-women")) return "women";
  return "unisex";
}

export function getCategoryZone<T extends ClassifiableCategory>(
  categories: T[],
  slug: string
): CategoryZone {
  if (!slug) return "other";
  const chain = getCategoryAncestors(categories, slug);
  for (const ancestor of chain) {
    for (const [zone, prefix] of Object.entries(ZONE_PREFIXES)) {
      if (ancestor.slug.startsWith(prefix)) return zone as CategoryZone;
    }
  }
  return "other";
}

export function getLeavesForZone<T extends ClassifiableCategory>(
  categories: T[],
  zone: CategoryZone,
  gender: CategoryGender
): T[] {
  if (zone === "other") return [];
  const isLeaf = (category: T) =>
    !categories.some((other) => other.parentSlug === category.slug);
  const seenLabels = new Set<string>();
  return categories.filter((category) => {
    if (!isLeaf(category)) return false;
    const categoryZone = getCategoryZone(categories, category.slug);
    if (categoryZone !== zone) return false;
    const categoryGender = getCategoryGender(categories, category.slug);
    const normalizedLabel = category.name.trim().toLowerCase();
    if (!normalizedLabel) return false;
    if (seenLabels.has(normalizedLabel)) return false;
    if (gender !== "unisex" && !(categoryGender === gender || categoryGender === "unisex")) return false;
    seenLabels.add(normalizedLabel);
    return true;
  });
}

export interface ZoneRequirements {
  generationTarget: "" | "outerwear" | "top" | "bottom" | "dress";
  fashionSubtype: "clothes" | "shoes" | "";
  needsModel: boolean;
  companionZones: CompanionZone[];
  needsTopCompanion: boolean;
  needsBottomCompanion: boolean;
  needsFootwearCompanion: boolean;
  needsLeftRightUploads: boolean;
  canGenerate: boolean;
}

function getCompanionZonesForTarget(zone: CategoryZone): CompanionZone[] {
  switch (zone) {
    case "top":
      return ["bottom", "footwear"];
    case "bottom":
      return ["top", "footwear"];
    case "outerwear":
      return ["top", "bottom", "footwear"];
    case "dress":
      return ["footwear"];
    default:
      return [];
  }
}

export function getZoneRequirements(zone: CategoryZone): ZoneRequirements {
  switch (zone) {
    case "top":
      return {
        generationTarget: "top",
        fashionSubtype: "clothes",
        needsModel: true,
        companionZones: getCompanionZonesForTarget("top"),
        needsTopCompanion: false,
        needsBottomCompanion: true,
        needsFootwearCompanion: true,
        needsLeftRightUploads: false,
        canGenerate: true,
      };
    case "bottom":
      return {
        generationTarget: "bottom",
        fashionSubtype: "clothes",
        needsModel: true,
        companionZones: getCompanionZonesForTarget("bottom"),
        needsTopCompanion: true,
        needsBottomCompanion: false,
        needsFootwearCompanion: true,
        needsLeftRightUploads: false,
        canGenerate: true,
      };
    case "outerwear":
      return {
        generationTarget: "outerwear",
        fashionSubtype: "clothes",
        needsModel: true,
        companionZones: getCompanionZonesForTarget("outerwear"),
        needsTopCompanion: true,
        needsBottomCompanion: true,
        needsFootwearCompanion: true,
        needsLeftRightUploads: false,
        canGenerate: true,
      };
    case "dress":
      return {
        generationTarget: "dress",
        fashionSubtype: "clothes",
        needsModel: true,
        companionZones: getCompanionZonesForTarget("dress"),
        needsTopCompanion: false,
        needsBottomCompanion: false,
        needsFootwearCompanion: true,
        needsLeftRightUploads: false,
        canGenerate: true,
      };
    case "footwear":
      return {
        generationTarget: "",
        fashionSubtype: "shoes",
        needsModel: false,
        companionZones: [],
        needsTopCompanion: false,
        needsBottomCompanion: false,
        needsFootwearCompanion: false,
        needsLeftRightUploads: true,
        canGenerate: true,
      };
    default:
      return {
        generationTarget: "",
        fashionSubtype: "clothes",
        needsModel: false,
        companionZones: [],
        needsTopCompanion: false,
        needsBottomCompanion: false,
        needsFootwearCompanion: false,
        needsLeftRightUploads: false,
        canGenerate: false,
      };
  }
}

export function getCompanionZonesForCategory(zone: CategoryZone): CompanionZone[] {
  return getCompanionZonesForTarget(zone);
}
