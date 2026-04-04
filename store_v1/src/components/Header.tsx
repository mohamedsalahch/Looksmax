"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";

export default function Header() {
  const { openCart, totalItems } = useCart();

  const togglePanel = () => {
    const event = new CustomEvent("toggleSidePanel");
    window.dispatchEvent(event);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-sm border-b border-border-color/50">
      <div className="flex items-center justify-between px-5 py-4">
        {/* Left — Hamburger */}
        <button
          id="hamburger-btn"
          onClick={togglePanel}
          onMouseEnter={() => {
            const event = new CustomEvent("openSidePanel");
            window.dispatchEvent(event);
          }}
          className="flex flex-col gap-[5px] group cursor-pointer p-1"
          aria-label="Open menu"
        >
          <span className="block w-5 h-[1.5px] bg-foreground transition-all duration-300 group-hover:w-4" />
          <span className="block w-5 h-[1.5px] bg-foreground transition-all duration-300" />
          <span className="block w-5 h-[1.5px] bg-foreground transition-all duration-300 group-hover:w-4" />
        </button>

        {/* Center — Logo */}
        <Link href="/" className="absolute left-1/2 -translate-x-1/2">
          <span className="text-sm font-semibold tracking-[0.25em] uppercase text-foreground">
            LOOKSMAX
          </span>
        </Link>

        {/* Right — Search + Cart */}
        <div className="flex items-center gap-4">
          <button className="text-foreground hover:text-text-secondary transition-colors cursor-pointer" aria-label="Search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
          <button
            onClick={openCart}
            className="text-foreground hover:text-text-secondary transition-colors cursor-pointer relative"
            aria-label="Open cart"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {/* Badge */}
            {totalItems > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-foreground text-background text-[9px] font-bold rounded-full flex items-center justify-center">
                {totalItems > 9 ? "9+" : totalItems}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
