"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/providers/CartContext";
import { useAuth } from "@/providers/AuthContext";

export default function Header() {
  const { openCart, totalItems } = useCart();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const togglePanel = () => {
    const event = new CustomEvent("toggleSidePanel");
    window.dispatchEvent(event);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !user) {
      router.prefetch("/login");
    }
  }, [mounted, user, router]);

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

        {/* Right — Cart + User */}
        <div className="flex items-center gap-2 md:gap-3">
          <Link
            href="/studio"
            className="hidden md:inline-flex h-9 items-center px-2 text-[10px] uppercase tracking-wider text-text-secondary hover:text-foreground transition-colors"
          >
            OUTFIT STUDIO
          </Link>

          <button
            onClick={openCart}
            className="relative inline-flex h-9 w-9 items-center justify-center text-foreground hover:text-text-secondary transition-colors cursor-pointer"
            type="button"
            aria-label="Open cart"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

          <Link
            href="/studio"
            className="inline-flex h-9 w-9 items-center justify-center text-foreground hover:text-text-secondary transition-colors md:hidden"
            aria-label="Open Outfit Studio"
          >
            <svg className="h-5 w-5 translate-y-[1px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 7.5c1.45 0 2.6-1.05 2.6-2.35S13.45 2.8 12 2.8 9.4 3.85 9.4 5.15" />
              <path d="M12 7.5v2" />
              <path d="M12 9.5 3.9 15.6a2.1 2.1 0 0 0 1.25 3.8h13.7a2.1 2.1 0 0 0 1.25-3.8L12 9.5Z" />
            </svg>
          </Link>

          {/* User Icon / Menu */}
          <div className="relative" ref={menuRef} suppressHydrationWarning>
            <button
              type="button"
              onClick={() => {
                if (mounted && user) {
                  setShowUserMenu((p) => !p);
                  return;
                }
                router.push("/login");
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-semibold tracking-[0.18em] text-foreground cursor-pointer transition-colors hover:bg-bg-secondary"
              aria-label="Account"
              suppressHydrationWarning
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>

            {mounted && user && showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-background shadow-xl z-50">
                <div className="px-4 py-3 border-b border-border-color/40">
                  <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
                  <p className="text-[10px] text-text-secondary truncate">{user.email}</p>
                </div>
                <Link
                  href="/studio"
                  onClick={() => setShowUserMenu(false)}
                  className="block px-4 py-2.5 text-[10px] uppercase tracking-wider text-foreground hover:text-accent hover:pl-5 transition-all md:hidden"
                >
                  OUTFIT STUDIO
                </Link>
                <Link
                  href="/account"
                  onClick={() => setShowUserMenu(false)}
                  className="block px-4 py-2.5 text-[10px] uppercase tracking-wider text-foreground hover:text-accent hover:pl-5 transition-all"
                >
                  MY ACCOUNT
                </Link>
                <Link
                  href="/account/orders"
                  onClick={() => setShowUserMenu(false)}
                  className="block px-4 py-2.5 text-[10px] uppercase tracking-wider text-foreground hover:text-accent hover:pl-5 transition-all"
                >
                  MY ORDERS
                </Link>
                <Link
                  href="/account/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="block px-4 py-2.5 text-[10px] uppercase tracking-wider text-foreground hover:text-accent hover:pl-5 transition-all"
                >
                  SETTINGS
                </Link>
                <button
                  onClick={async () => {
                    setShowUserMenu(false);
                    await logout();
                    router.replace("/login");
                    router.refresh();
                  }}
                  className="block w-full border-t border-border-color/40 px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-[#430C05] transition-all hover:pl-5 hover:text-[#8B3A2F] cursor-pointer"
                >
                  SIGN OUT
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
