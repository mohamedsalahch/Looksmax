"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

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
    const openHandler = () => setIsOpen(true);
    const toggleHandler = () => setIsOpen((prev) => !prev);

    window.addEventListener("openSidePanel", openHandler);
    window.addEventListener("toggleSidePanel", toggleHandler);

    return () => {
      window.removeEventListener("openSidePanel", openHandler);
      window.removeEventListener("toggleSidePanel", toggleHandler);
    };
  }, []);

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
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]
    );
  };

  const renderCategoryItems = (items: Category[], depth = 0): React.ReactNode =>
    items.map((cat) => {
      const isExpanded = expandedParents.includes(cat.slug);
      const hasChildren = Boolean(cat.children && cat.children.length > 0);

      return (
        <div key={cat._id} className="space-y-2">
          <div className="flex items-center justify-between gap-3" style={{ paddingLeft: `${depth * 16}px` }}>
            <Link
              href={`/category/${cat.slug}`}
              className={`block hover:text-text-secondary transition-colors ${depth === 0 ? "text-sm font-medium text-foreground" : "text-xs text-text-secondary hover:text-foreground"}`}
              onClick={() => setIsOpen(false)}
            >
              {cat.name}
            </Link>
            {hasChildren && (
              <button
                type="button"
                onClick={() => toggleExpanded(cat.slug)}
                className="flex-1 flex items-center justify-end py-1 text-text-secondary hover:text-foreground transition-colors cursor-pointer"
                aria-label={`Toggle ${cat.name} subcategories`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            )}
          </div>
          {hasChildren && (
            <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? "max-h-96 pt-1" : "max-h-0"}`}>
              <div className="space-y-2">{renderCategoryItems(cat.children || [], depth + 1)}</div>
            </div>
          )}
        </div>
      );
    });

  return (
    <>
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onFocus={() => setIsOpen(true)}
        className="fixed left-0 top-0 bottom-0 z-30 w-3 bg-transparent cursor-ew-resize"
        aria-label="Open category menu"
      />

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
        onMouseLeave={() => {
          setTimeout(() => setIsOpen(false), 300);
        }}
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
          {/* Quick Links */}
          <div className="space-y-3 mb-8">
            <Link
              href="/"
              className="block text-sm font-semibold text-foreground hover:text-text-secondary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/category/new-arrivals"
              className="block text-sm font-semibold text-foreground hover:text-text-secondary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              New Arrivals
            </Link>
            <Link
              href="/category/all"
              className="block text-sm font-semibold text-foreground hover:text-text-secondary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              All Categories
            </Link>
          </div>

          {/* Dynamic Categories */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
              Categories
            </h3>
            <div className="space-y-2.5">{renderCategoryItems(categories)}</div>
          </div>
        </div>
      </div>
    </>
  );
}
