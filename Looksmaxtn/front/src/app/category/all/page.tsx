import CategoryNav from "@/components/CategoryNav";
import ProductGrid from "@/components/ProductGrid";

export default function AllCategoriesPage() {
  return (
    <div className="pt-[57px]">
      <CategoryNav activeSlug="all-categories" />

      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <h1 className="text-sm font-medium tracking-wide">All Categories</h1>
      </div>

      <ProductGrid />
    </div>
  );
}
