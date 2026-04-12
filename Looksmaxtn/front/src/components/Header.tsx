"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useCart } from "@/providers/CartContext";
import { useAuth } from "@/providers/AuthContext";
import HeaderSearch from "@/components/HeaderSearch";

export default function Header() {
  const { openCart, totalItems } = useCart();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const togglePanel = () => {
    const event = new CustomEvent("toggleSidePanel");
    window.dispatchEvent(event);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

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

        {/* Right — Search + User + Cart */}
        <div className="flex items-center gap-2 md:gap-3">
          <Link
            href="/studio"
            className="hidden md:inline-flex h-9 items-center px-2 text-[10px] uppercase tracking-[0.24em] text-text-secondary hover:text-foreground transition-colors"
          >
            Outfit Studio
          </Link>
          <HeaderSearch />
          <button
            onClick={openCart}
            className="relative inline-flex h-9 w-9 items-center justify-center text-foreground hover:text-text-secondary transition-colors cursor-pointer"
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

          {/* User Icon / Menu */}
          <div className="relative" ref={menuRef}>
            {user ? (
              <>
                <button
                  onClick={() => setShowUserMenu((p) => !p)}
                  className="inline-flex h-9 w-9 items-center justify-center text-foreground hover:text-text-secondary transition-colors cursor-pointer"
                  aria-label="Account menu"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </button>

                {/* Dropdown */}
                {showUserMenu && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-background border border-border-color shadow-lg z-50">
                    <div className="px-4 py-3 border-b border-border-color">
                      <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
                      <p className="text-[10px] text-text-secondary truncate">{user.email}</p>
                    </div>
                    <Link
                      href="/studio"
                      onClick={() => setShowUserMenu(false)}
                      className="block px-4 py-2.5 text-xs text-foreground hover:bg-hover transition-colors"
                    >
                      Outfit Studio
                    </Link>
                    <Link
                      href="/account"
                      onClick={() => setShowUserMenu(false)}
                      className="block px-4 py-2.5 text-xs text-foreground hover:bg-hover transition-colors"
                    >
                      My Account
                    </Link>
                    <Link
                      href="/account/orders"
                      onClick={() => setShowUserMenu(false)}
                      className="block px-4 py-2.5 text-xs text-foreground hover:bg-hover transition-colors"
                    >
                      My Orders
                    </Link>
                    <Link
                      href="/account/settings"
                      onClick={() => setShowUserMenu(false)}
                      className="block px-4 py-2.5 text-xs text-foreground hover:bg-hover transition-colors"
                    >
                      Settings
                    </Link>
                    <button
                      onClick={() => {
                        logout();
                        setShowUserMenu(false);
                      }}
                      className="block w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-hover transition-colors border-t border-border-color cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-9 w-9 items-center justify-center text-foreground hover:text-text-secondary transition-colors"
                aria-label="Sign in"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
