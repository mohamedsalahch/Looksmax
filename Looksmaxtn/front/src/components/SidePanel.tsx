"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Category {
  _id: string;
  name: string;
  slug: string;
  parentSlug?: string | null;
  children?: Category[];
}

export default function SidePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedParents, setExpandedParents] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Fetch dynamic categories
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        if (data.tree && data.tree.length > 0) {
          setCategories(data.tree);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const toggleHandler = () => setIsOpen((prev) => !prev);

    window.addEventListener("toggleSidePanel", toggleHandler);

    return () => {
      window.removeEventListener("toggleSidePanel", toggleHandler);
    };
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const match = pathname?.match(/^\/category\/([^/?#]+)/);
    const activeSlug = match?.[1];
    if (!activeSlug || categories.length === 0) return;

    const findAncestorSlugs = (items: Category[], target: string, trail: string[] = []): string[] | null => {
      for (const item of items) {
        if (item.slug === target) return trail;
        if (item.children?.length) {
          const found = findAncestorSlugs(item.children, target, [...trail, item.slug]);
          if (found) return found;
        }
      }
      return null;
    };

    const ancestors = findAncestorSlugs(categories, activeSlug);
    if (ancestors && ancestors.length > 0) {
      setExpandedParents((current) => {
        const next = new Set(current);
        ancestors.forEach((slug) => next.add(slug));
        return Array.from(next);
      });
    }
  }, [pathname, categories]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const toggleExpanded = (slug: string) => {
    setExpandedParents((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug]
    );
  };

  const rowBase =
    "transition-all duration-150 cursor-pointer underline-offset-[6px] decoration-1";
  const rowActive =
    "text-foreground font-medium underline decoration-foreground";
  const rowIdle =
    "hover:pl-1 hover:text-foreground/60 hover:underline hover:decoration-foreground/60 group-hover:pl-1 group-hover:text-foreground/60 group-hover:underline group-hover:decoration-foreground/60";

  const renderCategoryItems = (items: Category[], depth = 0): React.ReactNode =>
    items.map((category) => {
    const hasChildren = Boolean(category.children && category.children.length > 0);
    const isExpanded = expandedParents.includes(category.slug);
    const isActive = pathname === `/category/${category.slug}`;
    const indent = depth === 0 ? 0 : depth === 1 ? 18 : 34;
    const rowTextClass =
      depth === 0
        ? "text-[14px] font-medium text-foreground"
        : depth === 1
          ? "text-[13px] text-foreground/88"
          : "text-[13px] text-text-secondary";

    if (!hasChildren) {
      return (
        <div
          key={category._id}
          className={`${depth > 0 ? "relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-border-color/30" : ""}`}
          style={{ paddingLeft: `${indent}px` }}
        >
          <Link
            href={`/category/${category.slug}`}
            className={`group flex min-h-10 items-center justify-between py-1.5 ${rowBase} ${isActive ? rowActive : rowIdle} ${rowTextClass}`}
            onClick={() => setIsOpen(false)}
          >
            <span>{category.name}</span>
          </Link>
        </div>
      );
    }

    return (
      <div
        key={category._id}
        className={`${depth > 0 ? "relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-border-color/30" : ""}`}
        style={{ paddingLeft: `${indent}px` }}
      >
        <div className="group flex items-center gap-3">
          <Link
            href={`/category/${category.slug}`}
            className={`flex min-h-10 items-center py-1.5 ${rowBase} ${isActive ? rowActive : rowIdle} ${rowTextClass}`}
            onClick={() => setIsOpen(false)}
          >
            <span className="inline-flex min-h-10 items-center">{category.name}</span>
          </Link>
          <button
            type="button"
            onClick={() => toggleExpanded(category.slug)}
            className="flex-1 inline-flex h-10 items-center justify-end text-text-secondary transition-colors hover:text-foreground cursor-pointer"
            aria-label={`Toggle ${category.name} subcategories`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>

        <div
          className={`overflow-hidden transition-all duration-200 ${
            isExpanded ? "max-h-[200vh] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="space-y-0.5 pb-1">{renderCategoryItems(category.children || [], depth + 1)}</div>
        </div>
      </div>
    );
  });

  return (
    <>
      {!mounted ? null : (
        <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-50 panel-overlay transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsOpen(false)}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 left-0 h-full w-full max-w-md z-50 bg-background shadow-2xl transition-panel flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color">
          <span className="text-sm font-semibold tracking-[0.15em] uppercase text-foreground">
            LOOKSMAX
          </span>

          <button
            onClick={() => setIsOpen(false)}
            className="inline-flex h-10 w-10 items-center justify-center text-foreground opacity-70 transition-opacity hover:opacity-100 cursor-pointer"
            aria-label="Close menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-8 space-y-1">
            <Link
              href="/"
              className={`group block py-2 text-sm font-semibold ${rowBase} ${pathname === "/" ? rowActive : rowIdle}`}
              onClick={() => setIsOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/category/new-arrivals"
              className={`group block py-2 text-sm font-semibold ${rowBase} ${pathname === "/category/new-arrivals" ? rowActive : rowIdle}`}
              onClick={() => setIsOpen(false)}
            >
              New Arrivals
            </Link>
            <Link
              href="/category/all"
              className={`group block py-2 text-sm font-semibold ${rowBase} ${pathname === "/category/all" ? rowActive : rowIdle}`}
              onClick={() => setIsOpen(false)}
            >
              All Categories
            </Link>
          </div>

          <div>
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Categories
            </h3>
            <div className="space-y-0.5">{renderCategoryItems(categories)}</div>
          </div>
        </div>
      </div>
        </>
      )}
    </>
  );
}
