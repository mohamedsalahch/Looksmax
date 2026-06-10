import CategoryNav, { type Category } from "@/components/CategoryNav";
import ProductGrid from "@/components/ProductGrid";
import { buildPageMetadata } from "@/lib/seo";

function formatSlug(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

async function loadCategoryName(slug: string) {
  if (slug === "new" || slug === "new-arrivals") return "New Arrivals";

  try {
    const baseUrl = BACKEND_URL;
    const res = await fetch(`${baseUrl}/api/store/categories`, { next: { revalidate: 60 } });
    if (!res.ok) return formatSlug(slug);
    const data = await res.json();
    const match = data.categories?.find((category: { slug: string; name: string }) => category.slug === slug);
    return match?.name || formatSlug(slug);
  } catch {
    return formatSlug(slug);
  }
}

export const revalidate = 60;

const BACKEND_URL = (
  process.env.BACKEND_PROXY_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://back:3002"
).replace(/\/$/, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const categoryName = await loadCategoryName(slug);

  return buildPageMetadata({
    title: `${categoryName} | LOOKSMAX Tunisia`,
    description: `Shop ${categoryName.toLowerCase()} at LOOKSMAX Tunisia. Discover curated men's fashion, shoes, perfumes, and outfit essentials.`,
    path: `/category/${slug}`,
  });
}

async function loadCategoryTree(): Promise<Category[]> {
  const baseUrl = BACKEND_URL;
  try {
    const res = await fetch(`${baseUrl}/api/store/categories`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.tree || [];
  } catch {
    return [];
  }
}

function categoryExists(categories: Category[], slug: string): boolean {
  return categories.some((category) => {
    if (category.slug === slug) return true;
    return category.children ? categoryExists(category.children, slug) : false;
  });
}

async function loadCategoryData(slug: string) {
  const baseUrl = BACKEND_URL;
  const params = new URLSearchParams();
  if (slug) params.set("category", slug);
  params.set("includeFacets", "1");
  params.set("limit", "12");

  try {
    const response = await fetch(`${baseUrl}/api/store/products?${params.toString()}`, { next: { revalidate: 60 } });
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

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const categoryTree = await loadCategoryTree();
  const isVirtualSlug = slug === "new" || slug === "new-arrivals";
  const resolvedSlug = isVirtualSlug || categoryExists(categoryTree, slug) ? slug : "";
  const initialData = await loadCategoryData(resolvedSlug);

  return (
    <div className="pt-[77px]">
      <CategoryNav activeSlug={resolvedSlug || "all-categories"} initialCategories={categoryTree} />

      <ProductGrid
        category={resolvedSlug || undefined}
        initialProducts={initialData.products}
        initialTotal={initialData.total}
        initialFacets={initialData.facets}
      />
    </div>
  );
}
