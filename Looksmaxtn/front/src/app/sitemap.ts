import type { MetadataRoute } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

type SitemapProduct = {
  _id?: string;
  updatedAt?: string;
};

type SitemapCategory = {
  slug?: string;
  updatedAt?: string;
};

function getBackendBaseUrl() {
  return (
    process.env.BACKEND_PROXY_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://127.0.0.1:3002"
  ).replace(/\/$/, "");
}

async function fetchSitemapProducts() {
  const params = new URLSearchParams();
  params.set("limit", "10000");

  const response = await fetch(`${getBackendBaseUrl()}/api/store/products?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.products) ? (data.products as SitemapProduct[]) : [];
}

async function fetchSitemapCategories() {
  const response = await fetch(`${getBackendBaseUrl()}/api/store/categories`, {
    cache: "no-store",
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.categories) ? (data.categories as SitemapCategory[]) : [];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/category/all"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/about"),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/contact"),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/terms-and-conditions"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  try {
    const [products, categories] = await Promise.all([
      fetchSitemapProducts(),
      fetchSitemapCategories(),
    ]);

    const categoryRoutes: MetadataRoute.Sitemap = categories
      .filter((category) => category.slug)
      .map((category) => ({
        url: absoluteUrl(`/category/${category.slug}`),
        lastModified: category.updatedAt,
        changeFrequency: "daily",
        priority: 0.8,
      }));

    const productRoutes: MetadataRoute.Sitemap = products
      .filter((product) => product._id)
      .map((product) => ({
        url: absoluteUrl(`/product/${String(product._id)}`),
        lastModified: product.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      }));

    return [...staticRoutes, ...categoryRoutes, ...productRoutes];
  } catch (error) {
    console.error("[sitemap] failed to build dynamic sitemap", error);
    return staticRoutes;
  }
}
