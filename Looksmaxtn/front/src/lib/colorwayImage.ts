type ColorwayImageSource = {
  image?: string;
  images?: { url: string; isMain: boolean }[];
  colorImages?: Record<string, number[]> | null;
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

  const frontIndex = indices.length >= 2 ? indices[indices.length - 2] : indices[0];
  return source.images[frontIndex]?.url || fallback;
}
