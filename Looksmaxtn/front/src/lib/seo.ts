import type { Metadata } from "next";

export const SITE_NAME = "LOOKSMAX";
export const SITE_URL = (process.env.NEXT_PUBLIC_BASE_URL || "https://looksmaxtn.com").replace(/\/$/, "");
export const DEFAULT_DESCRIPTION =
  "Shop curated men's fashion, clothing, shoes, perfumes, and outfit essentials in Tunisia with LOOKSMAX.";

export function absoluteUrl(path = "/") {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function truncateDescription(value: string, maxLength = 155) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

export function buildPageMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  image,
  noIndex = false,
}: {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
}): Metadata {
  const canonical = absoluteUrl(path);
  const normalizedDescription = truncateDescription(description);
  const images = image
    ? [
        {
          url: absoluteUrl(image),
          width: 1200,
          height: 630,
          alt: title,
        },
      ]
    : undefined;

  return {
    title,
    description: normalizedDescription,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description: normalizedDescription,
      url: canonical,
      siteName: SITE_NAME,
      images,
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description: normalizedDescription,
      images: image ? [absoluteUrl(image)] : undefined,
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
        }
      : undefined,
    other: {
      ...(process.env.NEXT_PUBLIC_FACEBOOK_APP_ID
        ? { "fb:app_id": process.env.NEXT_PUBLIC_FACEBOOK_APP_ID }
        : {}),
    },
  };
}

export function productAvailability(stock: number) {
  return stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
}
