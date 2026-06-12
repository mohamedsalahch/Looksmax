const R2_HOST = (process.env.NEXT_PUBLIC_R2_PUBLIC_HOST || "").trim();

/**
 * Only R2-hosted images go through the Next.js image optimizer (it is the only
 * host allowed in next.config images.remotePatterns). Everything else — data
 * URIs, legacy /uploads paths, third-party hosts — renders unoptimized so it
 * keeps working exactly as a plain <img> would.
 */
export function isOptimizableImageSrc(src: string) {
  if (!R2_HOST || !src.startsWith("https://")) return false;
  try {
    return new URL(src).hostname === R2_HOST;
  } catch {
    return false;
  }
}
