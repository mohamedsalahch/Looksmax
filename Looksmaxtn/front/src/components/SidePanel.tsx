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
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const pathname = usePathname();

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
    setExpandedParents([]);
  }, [pathname]);

  useEffect(() => {
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;

      const touch = event.touches[0];
      if (!isOpen && touch.clientX > 24) return;

      touchStartXRef.current = touch.clientX;
      touchStartYRef.current = touch.clientY;
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (touchStartXRef.current === null || touchStartYRef.current === null) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchStartXRef.current;
      const deltaY = touch.clientY - touchStartYRef.current;

      touchStartXRef.current = null;
      touchStartYRef.current = null;

      if (Math.abs(deltaY) > Math.abs(deltaX)) return;

      if (!isOpen && deltaX > 70) {
        setIsOpen(true);
        return;
      }

      if (isOpen && deltaX < -70) {
        setIsOpen(false);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isOpen]);

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

  const renderCategoryItems = (items: Category[], depth = 0): React.ReactNode =>
    items.map((category) => {
    const hasChildren = Boolean(category.children && category.children.length > 0);
    const isExpanded = expandedParents.includes(category.slug);
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
            className={`flex min-h-10 items-center justify-between py-1.5 transition-colors hover:text-foreground ${rowTextClass}`}
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
        <div className="flex items-center gap-3">
          <Link
            href={`/category/${category.slug}`}
            className={`min-h-10 py-1.5 transition-colors hover:text-foreground ${rowTextClass}`}
            onClick={() => setIsOpen(false)}
          >
            <span className="inline-flex min-h-10 items-center">{category.name}</span>
          </Link>
          <button
            type="button"
            onClick={() => toggleExpanded(category.slug)}
            className="flex-1 inline-flex h-10 items-center justify-end text-text-secondary transition-colors hover:text-foreground"
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
            className="text-foreground hover:text-text-secondary transition-colors cursor-pointer"
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
          <div className="mb-8 space-y-3">
            <Link
              href="/"
              className="block text-sm font-semibold text-foreground transition-colors hover:text-text-secondary"
              onClick={() => setIsOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/category/new-arrivals"
              className="block text-sm font-semibold text-foreground transition-colors hover:text-text-secondary"
              onClick={() => setIsOpen(false)}
            >
              New Arrivals
            </Link>
            <Link
              href="/category/all"
              className="block text-sm font-semibold text-foreground transition-colors hover:text-text-secondary"
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
  );
}
