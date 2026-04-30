"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { clearToken, withAuthRequest } from "@/lib/authClient";

export interface StoreSession {
  id: string;
  storeName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  logo: string;
  onboardingCompleted: boolean;
}

const navItems = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Products", href: "/products" },
  { name: "Orders", href: "/orders" },
];

export default function StoreDashboardShell({
  children,
  onStoreLoad,
}: {
  children: ReactNode;
  onStoreLoad?: (store: StoreSession) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const [store, setStore] = useState<StoreSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", withAuthRequest())
      .then(async (response) => {
        if (!response.ok) {
          clearToken();
          router.replace("/");
          return null;
        }
        return response.json();
      })
      .then((data) => {
        if (!data?.store) return;
        setStore(data.store);
        onStoreLoad?.(data.store);
      })
      .catch(() => {
        clearToken();
        router.replace("/");
      })
      .finally(() => setLoading(false));
  }, [onStoreLoad, router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

  const logout = () => {
    setShowUserMenu(false);
    clearToken();
    router.replace("/");
  };

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-text-secondary">Loading...</main>;
  }

  if (!store) return null;

  return (
    <div className="min-h-screen bg-background">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-border-color bg-background/95 backdrop-blur transition-transform md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-border-color px-6 py-5">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-foreground">LOOKSMAX</p>
          <p className="mt-2 truncate text-[10px] uppercase tracking-[0.18em] text-text-secondary">{store.storeName}</p>
        </div>
        <nav className="px-4 py-5">
          <div className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`block px-3 py-2.5 text-xs uppercase tracking-[0.18em] transition-colors ${
                    active ? "bg-hover text-foreground" : "text-text-secondary hover:bg-hover/70 hover:text-foreground"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>

      <div className="fixed right-0 top-0 z-50 px-4 py-4 md:px-5">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="fixed left-5 top-4 flex flex-col gap-[5px] p-1 md:hidden"
            aria-label="Open navigation"
          >
            <span className="block h-[1.5px] w-5 bg-foreground" />
            <span className="block h-[1.5px] w-5 bg-foreground" />
            <span className="block h-[1.5px] w-5 bg-foreground" />
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowUserMenu((current) => !current)}
              className="inline-flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:text-text-secondary"
              aria-label="Account menu"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full z-50 mt-2 w-48 border border-border-color bg-background shadow-xl">
                <div className="border-b border-border-color/40 px-4 py-3">
                  <p className="truncate text-xs font-medium text-foreground">{store.ownerName || store.storeName}</p>
                  <p className="truncate text-[10px] text-text-secondary">{store.ownerEmail}</p>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="block px-4 py-2.5 text-xs text-foreground transition-all hover:pl-5 hover:text-accent"
                >
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="block w-full border-t border-border-color/40 px-4 py-2.5 text-left text-xs leading-none text-[#430C05] transition-colors hover:bg-[#faf3f2]"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="min-h-screen px-4 pb-12 pt-20 md:ml-64 md:px-8 md:pt-10">
        {children}
      </main>
    </div>
  );
}
