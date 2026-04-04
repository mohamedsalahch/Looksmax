"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { name: "New", slug: "new" },
  { name: "T-Shirts", slug: "t-shirts" },
  { name: "Polos", slug: "polos" },
  { name: "Jeans", slug: "jeans" },
  { name: "Trousers", slug: "trousers" },
  { name: "Shorts", slug: "shorts" },
  { name: "Shirts", slug: "shirts" },
  { name: "Sweat", slug: "sweat" },
  { name: "Jackets", slug: "jackets" },
  { name: "Knits", slug: "knits" },
  { name: "Shoes", slug: "shoes" },
  { name: "Accessories", slug: "accessories" },
];

export default function CategoryNav({ activeSlug }: { activeSlug: string }) {
  return (
    <nav className="sticky top-[57px] z-30 bg-background/95 backdrop-blur-sm border-b border-border-color">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-6 overflow-x-auto py-3 scrollbar-hide">
          {navItems.map((item) => (
            <Link
              key={item.slug}
              href={`/category/${item.slug}`}
              className={`text-xs whitespace-nowrap transition-colors pb-0.5 ${
                activeSlug === item.slug
                  ? "text-foreground font-medium border-b border-foreground"
                  : "text-text-secondary hover:text-foreground"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
