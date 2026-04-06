import CategoryNav from "@/components/CategoryNav";
import ProductGrid from "@/components/ProductGrid";

function formatSlug(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Fetch category name from API (server-side)
  let categoryName = formatSlug(slug);
  if (slug === "new" || slug === "new-arrivals") {
    categoryName = "New Arrivals";
  } else {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3002";
      const res = await fetch(`${baseUrl}/api/categories`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const match = data.categories?.find(
          (c: { slug: string; name: string }) => c.slug === slug
        );
        if (match) categoryName = match.name;
      }
    } catch {
      // fallback to formatted slug
    }
  }

  return (
    <div className="pt-[57px]">
      <CategoryNav activeSlug={slug} />

      {/* Category header */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <h1 className="text-sm font-medium tracking-wide">{categoryName}</h1>
      </div>

      <ProductGrid category={slug} />
    </div>
  );
}
