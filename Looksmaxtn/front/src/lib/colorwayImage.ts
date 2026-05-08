type ColorwayImageSource = {
  image?: string;
  images?: { url: string; isMain: boolean }[];
  colorImages?: Record<string, number[]> | null;
};

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

export function getColorwayEnhancedFrontImage(
  hex: string | null | undefined,
  source: ColorwayImageSource,
  fallback = ""
) {
  return getColorwayViewImage(hex, source, "front", fallback);
}

export function getColorwayEnhancedLeftImage(
  hex: string | null | undefined,
  source: ColorwayImageSource,
  fallback = ""
) {
  return getColorwayViewImage(hex, source, "left", fallback);
}

function getColorwayViewImage(
  hex: string | null | undefined,
  source: ColorwayImageSource,
  view: "front" | "back" | "left" | "right",
  fallback = ""
) {
  if (!source.images || source.images.length === 0) {
    return fallback;
  }

  const indices = hex && source.colorImages?.[hex]
    ? source.colorImages[hex]
    : source.images.map((_, index) => index);

  const sortedIndices = [...indices].sort((a, b) => a - b);
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
  fallback = ""
) {
  if (!hex || !source.colorImages || !source.images || source.images.length === 0) {
    return fallback;
  }

  const indices = source.colorImages[hex];
  if (!indices || indices.length === 0) {
    return fallback;
  }

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
