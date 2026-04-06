"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Category {
  _id: string;
  name: string;
  slug: string;
  parentSlug?: string | null;
  children?: Category[];
}

const fallbackCategories: Category[] = [
  {
    _id: "1",
    name: "Men",
    slug: "men",
    children: [
      { _id: "1-1", name: "Garments", slug: "garments", parentSlug: "men" },
      { _id: "1-2", name: "Fragrances", slug: "fragrances", parentSlug: "men" },
      { _id: "1-3", name: "Shoes", slug: "shoes", parentSlug: "men" },
    ],
  },
  {
    _id: "2",
    name: "Women",
    slug: "women",
    children: [
      { _id: "2-1", name: "Garments", slug: "women-garments", parentSlug: "women" },
      { _id: "2-2", name: "Fragrances", slug: "women-fragrances", parentSlug: "women" },
      { _id: "2-3", name: "Shoes", slug: "women-shoes", parentSlug: "women" },
    ],
  },
  { _id: "3", name: "Children", slug: "children", children: [] },
];

export default function CategoryNav({ activeSlug }: { activeSlug: string }) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const findCategoryPath = (items: Category[], slug: string, trail: string[] = []): string[] | null => {
    for (const item of items) {
      const nextTrail = [...trail, item.slug];
      if (item.slug === slug) return nextTrail;
      if (item.children?.length) {
        const childTrail = findCategoryPath(item.children, slug, nextTrail);
        if (childTrail) return childTrail;
      }
    }

    return null;
  };
  const findCategoryBySlug = (items: Category[], slug: string): Category | null => {
    for (const item of items) {
      if (item.slug === slug) return item;
      if (item.children?.length) {
        const childMatch = findCategoryBySlug(item.children, slug);
        if (childMatch) return childMatch;
      }
    }

    return null;
  };

  const activePath = useMemo(() => findCategoryPath(categories, activeSlug) || [], [activeSlug, categories]);
  const [expandedParent, setExpandedParent] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        if (data.tree && data.tree.length > 0) {
          setCategories(data.tree);
        }
      })
      .catch(() => {}); // Keep fallback
  }, []);

  useEffect(() => {
    setExpandedParent(null);
    setPreviewPath([]);
  }, [activeSlug]);

  useEffect(() => {
    if (!expandedParent) {
      setPreviewPath([]);
      return;
    }

    if (activePath[0] === expandedParent) {
      setPreviewPath(activePath);
      return;
    }

    setPreviewPath([expandedParent]);
  }, [activePath, expandedParent]);

  const expandedParentNode = useMemo(
    () => categories.find((category) => category.slug === expandedParent) || null,
    [categories, expandedParent]
  );

  const drilldownColumns = useMemo(() => {
    if (!expandedParentNode?.children?.length) return [];

    const columns: Category[][] = [expandedParentNode.children];
    let currentLevel = expandedParentNode.children;

    for (const slug of previewPath.slice(1)) {
      const matched = currentLevel.find((item) => item.slug === slug);
      if (!matched?.children?.length) break;
      columns.push(matched.children);
      currentLevel = matched.children;
    }

    return columns.slice(0, 3);
  }, [expandedParentNode, previewPath]);

  const setPreviewDepth = (depth: number, slug: string) => {
    setPreviewPath((current) => {
      const next = [expandedParent || "", ...current.slice(1, depth), slug].filter(Boolean);
      return next;
    });
  };

  return (
    <nav className="sticky top-[57px] z-30 bg-background/95 backdrop-blur-sm border-b border-border-color">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-6 overflow-x-auto py-3 scrollbar-hide">
          <Link href="/" className={`text-xs whitespace-nowrap transition-colors py-1 px-1 ${activeSlug === "home" ? "text-foreground font-medium border-b border-foreground" : "text-text-secondary hover:text-foreground"}`}>
            Home
          </Link>
          <Link href="/category/new-arrivals" className={`text-xs whitespace-nowrap transition-colors py-1 px-1 ${activeSlug === "new-arrivals" ? "text-foreground font-medium border-b border-foreground" : "text-text-secondary hover:text-foreground"}`}>
            New Arrivals
          </Link>
          <Link href="/category/all" className={`text-xs whitespace-nowrap transition-colors py-1 px-1 ${activeSlug === "all-categories" ? "text-foreground font-medium border-b border-foreground" : "text-text-secondary hover:text-foreground"}`}>
            All Categories
          </Link>
          {categories.map((item) => (
            <div
              key={item._id}
              className="flex items-center gap-1 whitespace-nowrap"
              onClick={() => {
                if (!item.children || item.children.length === 0) return;
                setExpandedParent((current) => {
                  const next = current === item.slug ? null : item.slug;
                  setPreviewPath(next ? [next] : []);
                  return next;
                });
              }}
            >
              <Link
                href={`/category/${item.slug}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedParent(item.slug);
                  setPreviewPath([item.slug]);
                }}
                className={`text-xs transition-colors py-1 px-1 ${
                  activePath.includes(item.slug)
                    ? "text-foreground font-medium border-b border-foreground"
                    : "text-text-secondary hover:text-foreground"
                }`}
              >
                {item.name}
              </Link>
              {item.children && item.children.length > 0 ? (
                <div
                  className={`pb-0.5 transition-colors ${
                    expandedParent === item.slug ? "text-foreground" : "text-text-secondary"
                  }`}
                  aria-hidden="true"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform duration-200 ${expandedParent === item.slug ? "rotate-180" : ""}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div
          className={`overflow-hidden transition-all duration-200 ease-out ${
            drilldownColumns.length > 0 ? "max-h-[420px] opacity-100 pb-4" : "max-h-0 opacity-0"
          }`}
        >
          <div className="grid gap-3 border-t border-border-color pt-3 md:grid-cols-3">
            {drilldownColumns.map((column, columnIndex) => (
              <div key={`col-${columnIndex}`} className="min-w-0">
                <div className="space-y-1">
                  {column.map((item) => {
                    const isCurrent = activeSlug === item.slug;
                    const isPreviewed = previewPath[columnIndex + 1] === item.slug;
                    const hasChildren = Boolean(item.children?.length);

                    return (
                      <div
                        key={item._id}
                        onClick={() => {
                          if (hasChildren) {
                            setPreviewDepth(columnIndex + 1, item.slug);
                            return;
                          }
                          router.push(`/category/${item.slug}`);
                        }}
                        className={`flex items-center justify-between gap-3 px-2 py-2 transition-colors ${
                          isCurrent || isPreviewed ? "bg-[#ede1ce]" : "hover:bg-[#ede1ce]/60"
                        }`}
                      >
                        <Link
                          href={`/category/${item.slug}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`min-w-0 text-[12px] ${
                            isCurrent ? "font-medium text-foreground" : "text-text-secondary hover:text-foreground"
                          }`}
                        >
                          {item.name}
                        </Link>
                        {hasChildren ? <div className="w-4 shrink-0" aria-hidden="true" /> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
