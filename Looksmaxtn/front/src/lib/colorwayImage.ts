type VariantSummary = {
  color?: string | null;
  images?: number[];
};

export type ViewGender = "men" | "women" | null | undefined;

type ColorwayImage = { url: string; isMain: boolean; gender?: "men" | "women" | null };

type ColorwayImageSource = {
  image?: string;
  images?: ColorwayImage[];
  variants?: ReadonlyArray<VariantSummary> | null;
};

/**
 * For unisex products each model picture is tagged with a gender. When a browse
 * gender is supplied and the product has pictures for it, restrict the candidate
 * indices to that gender so Men shows the male model and Women the female model.
 * Non-unisex products (no gendered images) are left untouched.
 */
function restrictIndicesToGender(
  indices: number[],
  images: ColorwayImage[],
  viewGender: ViewGender
): number[] {
  if (!viewGender) return indices;
  const matching = indices.filter((i) => images[i]?.gender === viewGender);
  return matching.length > 0 ? matching : indices;
}

type EnhancedFrontImageSource = ColorwayImageSource & {
  color?: string | null;
  fashionSubtype?: "clothes" | "shoes" | null;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
};

function getIndicesForHex(hex: string | null | undefined, source: ColorwayImageSource): number[] {
  if (!hex || !source.variants) return [];
  const target = hex.toLowerCase();
  for (const variant of source.variants) {
    if (variant?.color?.toLowerCase() === target) {
      return Array.isArray(variant.images) ? [...variant.images] : [];
    }
  }
  return [];
}

export function getColorwayEnhancedFrontImage(
  hex: string | null | undefined,
  source: ColorwayImageSource,
  fallback = "",
  viewGender: ViewGender = null
) {
  return getColorwayViewImage(hex, source, "front", fallback, viewGender);
}

export function getColorwayEnhancedLeftImage(
  hex: string | null | undefined,
  source: ColorwayImageSource,
  fallback = "",
  viewGender: ViewGender = null
) {
  return getColorwayViewImage(hex, source, "left", fallback, viewGender);
}

function getColorwayViewImage(
  hex: string | null | undefined,
  source: ColorwayImageSource,
  view: "front" | "back" | "left" | "right",
  fallback = "",
  viewGender: ViewGender = null
) {
  if (!source.images || source.images.length === 0) {
    return fallback;
  }

  const indices = hex ? getIndicesForHex(hex, source) : [];
  const effectiveRaw = indices.length > 0 ? indices : source.images.map((_, index) => index);
  const effective = restrictIndicesToGender(effectiveRaw, source.images, viewGender);
  const sortedIndices = [...effective].sort((a, b) => a - b);
  if (sortedIndices.length === 0) {
    return fallback;
  }

  const viewCount = sortedIndices.length >= 4 ? 4 : 2;
  const viewStartIndex = Math.max(sortedIndices.length - viewCount, 0);
  const viewOffset = view === "front"
    ? 0
    : view === "back"
      ? 1
      : view === "left"
        ? 2
        : 3;
  const targetIndex = sortedIndices[viewStartIndex + viewOffset];
  return source.images[targetIndex]?.url || fallback;
}

export function getColorwayMainImage(
  hex: string | null | undefined,
  source: ColorwayImageSource,
  fallback = "",
  viewGender: ViewGender = null
) {
  if (!source.images || source.images.length === 0) {
    return fallback;
  }

  const rawIndices = hex ? getIndicesForHex(hex, source) : [];
  if (rawIndices.length === 0) {
    // No colorway selected. For unisex products (images carry a gender tag) pick
    // the browse gender's front model so the card matches the chosen category;
    // otherwise keep the caller's fallback, which already honors the main image.
    if (viewGender && source.images.some((image) => image.gender === viewGender)) {
      return getColorwayEnhancedFrontImage(null, source, fallback, viewGender);
    }
    return fallback;
  }

  const indices = restrictIndicesToGender(rawIndices, source.images, viewGender);
  const mainIndex = [...indices].sort((a, b) => a - b)[0];
  return source.images[mainIndex]?.url || fallback;
}

export function getEnhancedFrontDisplayImage(
  source: EnhancedFrontImageSource,
  fallback = ""
) {
  if (source.image) {
    return source.image;
  }

  if (source.color) {
    const colorwayImage = getColorwayEnhancedFrontImage(source.color, source, "");
    if (colorwayImage) {
      return colorwayImage;
    }
  }

  return source.originPictures?.front || fallback;
}
