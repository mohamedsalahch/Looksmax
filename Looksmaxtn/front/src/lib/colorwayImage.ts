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
  if (!hex || !source.colorImages || !source.images || source.images.length === 0) {
    return fallback;
  }

  const indices = source.colorImages[hex];
  if (!indices || indices.length === 0) {
    return fallback;
  }

  const sortedIndices = [...indices].sort((a, b) => a - b);
  const viewCount = sortedIndices.length >= 4 ? 4 : 2;
  const frontIndex = sortedIndices[Math.max(sortedIndices.length - viewCount, 0)];
  return source.images[frontIndex]?.url || fallback;
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
