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

export default function CategoryNav({
  activeSlug,
}: {
  activeSlug: string;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const findCategoryPath = (items: Category[], slug: string, trail: string[] = []): string[] | null => {
    if (!Array.isArray(items)) return null;

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
    if (!Array.isArray(items)) return null;

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
    setExpandedParent(null);
    setPreviewPath([]);
  }, [activeSlug]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        if (data.tree && data.tree.length > 0) {
          setCategories(data.tree);
        }
      })
      .catch(() => {})
      .finally(() => {
        setCategoriesLoaded(true);
      });
  }, []);

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
    <nav className="hidden md:block sticky top-[57px] z-30 border-b border-border-color/70 bg-background/92 backdrop-blur-md shadow-[0_8px_24px_rgba(26,26,26,0.04)]">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-2 overflow-x-auto px-2 py-2.5 scrollbar-hide md:px-4">
          <Link href="/" className={`hidden whitespace-nowrap border px-3 py-1.5 text-xs transition-all md:inline-block ${activeSlug === "home" ? "border-border-color bg-[#ede1ce] text-foreground font-medium" : "border-transparent text-text-secondary hover:border-border-color hover:bg-[#ede1ce]/70 hover:text-foreground"}`}>
            Home
          </Link>
          <Link href="/category/new-arrivals" className={`hidden whitespace-nowrap border px-3 py-1.5 text-xs transition-all md:inline-block ${activeSlug === "new-arrivals" ? "border-border-color bg-[#ede1ce] text-foreground font-medium" : "border-transparent text-text-secondary hover:border-border-color hover:bg-[#ede1ce]/70 hover:text-foreground"}`}>
            New Arrivals
          </Link>
          <Link href="/category/all" className={`hidden whitespace-nowrap border px-3 py-1.5 text-xs transition-all md:inline-block ${activeSlug === "all-categories" ? "border-border-color bg-[#ede1ce] text-foreground font-medium" : "border-transparent text-text-secondary hover:border-border-color hover:bg-[#ede1ce]/70 hover:text-foreground"}`}>
            All Categories
          </Link>
          {categoriesLoaded && categories.map((item) => (
            <div
              key={item._id}
              className="hidden items-center gap-2 whitespace-nowrap md:flex"
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
                className={`border px-3 py-1.5 text-xs transition-all ${
                  activePath.includes(item.slug)
                    ? "border-border-color bg-[#ede1ce] text-foreground font-medium"
                    : "border-transparent text-text-secondary hover:border-border-color hover:bg-[#ede1ce]/70 hover:text-foreground"
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
            categoriesLoaded && drilldownColumns.length > 0 ? "max-h-[420px] opacity-100 pb-4" : "max-h-0 opacity-0"
          }`}
        >
          <div className="grid gap-3 border-t border-border-color/70 pt-3 md:grid-cols-3">
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
                        className={`flex items-center justify-between gap-3 border px-3 py-2.5 transition-all ${
                          isCurrent || isPreviewed
                            ? "border-[#d8c9b8] bg-[#ede1ce]"
                            : "border-transparent hover:border-[#d8c9b8] hover:bg-[#ede1ce]/60"
                        }`}
                      >
                        <Link
                          href={`/category/${item.slug}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`min-w-0 text-[12px] transition-colors ${
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
