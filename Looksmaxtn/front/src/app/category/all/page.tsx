import CategoryNav, { type Category } from "@/components/CategoryNav";
import ProductGrid from "@/components/ProductGrid";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 60;

const BACKEND_URL = (
  process.env.BACKEND_PROXY_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://back:3002"
).replace(/\/$/, "");

export const metadata = buildPageMetadata({
  title: "All Collections | LOOKSMAX Tunisia",
  description:
    "Browse all LOOKSMAX Tunisia collections, including men's clothing, shoes, perfumes, and curated fashion essentials.",
  path: "/category/all",
});

async function loadCategoryTree(): Promise<Category[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/store/categories`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.tree || [];
  } catch {
    return [];
  }
}

async function loadAllCategoriesData() {
  const params = new URLSearchParams();
  params.set("includeFacets", "1");

  try {
    const response = await fetch(`${BACKEND_URL}/api/store/products?${params.toString()}`, { next: { revalidate: 60 } });
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
        initialFacets={initialData.facets}
      />
    </div>
  );
}
