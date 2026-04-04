"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const categories = {
  collection: [
    { name: "Promotions", href: "/category/promotions" },
    { name: "Swim", href: "/category/swim" },
    { name: "Linen", href: "/category/linen" },
    { name: "T-Shirts", href: "/category/t-shirts" },
    { name: "Polos", href: "/category/polos" },
    { name: "Jeans", href: "/category/jeans" },
    { name: "Trousers", href: "/category/trousers" },
    { name: "Shorts", href: "/category/shorts" },
    { name: "Sweat", href: "/category/sweat" },
    { name: "Shirts", href: "/category/shirts" },
    { name: "Jackets", href: "/category/jackets" },
    { name: "Knits & Cardigans", href: "/category/knits" },
    { name: "Sportswear", href: "/category/sportswear" },
    { name: "Total Look", href: "/category/total-look" },
    { name: "Basics", href: "/category/basics" },
  ],
  accessories: [
    { name: "Shoes", href: "/category/shoes" },
    { name: "Bags & Backpacks", href: "/category/bags" },
    { name: "Accessories", href: "/category/accessories" },
  ],
  inspiration: [
    { name: "Collaborations", href: "/category/collaborations" },
    { name: "Special Collection", href: "/category/special-collection" },
  ],
};

export default function SidePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"women" | "men">("men");
  const panelRef = useRef<HTMLDivElement>(null);

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
        onMouseLeave={() => {
          // small delay before closing so the panel doesn't flicker
          setTimeout(() => setIsOpen(false), 300);
        }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color">
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

          {/* Tabs */}
          <div className="flex gap-6 text-sm">
            <button
              onClick={() => setActiveTab("women")}
              className={`pb-0.5 cursor-pointer transition-colors ${
                activeTab === "women"
                  ? "text-foreground font-medium border-b border-foreground"
                  : "text-text-secondary hover:text-foreground"
              }`}
            >
              Women
            </button>
            <button
              onClick={() => setActiveTab("men")}
              className={`pb-0.5 cursor-pointer transition-colors ${
                activeTab === "men"
                  ? "text-foreground font-medium border-b border-foreground"
                  : "text-text-secondary hover:text-foreground"
              }`}
            >
              Men
            </button>
          </div>

          <div className="w-5" /> {/* spacer for alignment */}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Quick Links */}
          <div className="space-y-3 mb-8">
            <Link
              href="/category/new"
              className="block text-sm font-semibold text-foreground hover:text-text-secondary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              New Arrivals
            </Link>
            <Link
              href="/category/stwd"
              className="block text-sm font-semibold text-foreground hover:text-text-secondary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              STWD
            </Link>
            <Link
              href="/category/community"
              className="block text-sm font-semibold text-foreground hover:text-text-secondary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Community Stories
            </Link>
          </div>

          {/* Collection + Inspiration columns */}
          <div className="flex gap-16">
            {/* Collection */}
            <div>
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
                Collection
              </h3>
              <div className="space-y-2.5">
                {categories.collection.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block text-sm text-foreground hover:text-text-secondary transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>

              {/* Accessories */}
              <div className="mt-6 space-y-2.5">
                {categories.accessories.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block text-sm text-foreground hover:text-text-secondary transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* Inspiration */}
            <div>
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
                Find Inspiration
              </h3>
              <div className="space-y-2.5">
                {categories.inspiration.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block text-sm text-foreground hover:text-text-secondary transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
