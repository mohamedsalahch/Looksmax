import CategoryNav from "@/components/CategoryNav";
import ProductGrid from "@/components/ProductGrid";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "All Collections | LOOKSMAX Tunisia",
  description:
    "Browse all LOOKSMAX Tunisia collections, including men's clothing, shoes, perfumes, and curated fashion essentials.",
  path: "/category/all",
});

async function loadAllCategoriesData() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const params = new URLSearchParams();
  params.set("includeFacets", "1");
  params.set("limit", "24");

  const response = await fetch(`${baseUrl}/api/products?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    return { products: [], total: 0, facets: null };
  }

  const data = await response.json();
  return {
    products: data.products || [],
    total: data.total || 0,
    facets: data.facets || null,
  };
}

export default async function AllCategoriesPage() {
  const initialData = await loadAllCategoriesData();

  return (
    <div className="pt-[77px]">
      <CategoryNav activeSlug="all-categories" />

      <ProductGrid
        initialProducts={initialData.products}
        initialTotal={initialData.total}
        initialFacets={initialData.facets}
      />
    </div>
  );
}
