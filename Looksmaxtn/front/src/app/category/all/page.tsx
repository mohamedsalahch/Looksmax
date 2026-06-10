import CategoryNav, { type Category } from "@/components/CategoryNav";
import ProductGrid from "@/components/ProductGrid";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 60;

export const metadata = buildPageMetadata({
  title: "All Collections | LOOKSMAX Tunisia",
  description:
    "Browse all LOOKSMAX Tunisia collections, including men's clothing, shoes, perfumes, and curated fashion essentials.",
  path: "/category/all",
});

async function loadCategoryTree(): Promise<Category[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/categories`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.tree || [];
  } catch {
    return [];
  }
}

async function loadAllCategoriesData() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const params = new URLSearchParams();
  params.set("includeFacets", "1");
  params.set("limit", "12");

  try {
    const response = await fetch(`${baseUrl}/api/products?${params.toString()}`, { next: { revalidate: 60 } });
    if (!response.ok) return { products: [], total: 0, facets: null };
    const data = await response.json();
    return {
      products: data.products || [],
      total: data.total || 0,
      facets: data.facets || null,
    };
  } catch {
    return { products: [], total: 0, facets: null };
  }
}

export default async function AllCategoriesPage() {
  const [initialData, categoryTree] = await Promise.all([
    loadAllCategoriesData(),
    loadCategoryTree(),
  ]);

  return (
    <div className="pt-[77px]">
      <CategoryNav activeSlug="all-categories" initialCategories={categoryTree} />

      <ProductGrid
        initialProducts={initialData.products}
        initialTotal={initialData.total}
        initialFacets={initialData.facets}
      />
    </div>
  );
}
