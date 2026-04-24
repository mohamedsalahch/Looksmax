"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthContext";

const navItems = [
  { name: "Overview", href: "/account" },
  { name: "Orders", href: "/account/orders" },
  { name: "Settings", href: "/account/settings" },
  { name: "Outfit Studio", href: "/studio" },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, pathname, router, user]);

  if (loading || !user) {
    return (
      <div className="pt-[72px] min-h-screen">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
          <div className="h-5 w-36 animate-pulse bg-border-color/50 mb-1" />
          <div className="h-3 w-52 animate-pulse bg-border-color/40 mb-8" />
          <div className="flex flex-col md:flex-row gap-8">
            <div className="md:w-48 shrink-0 flex md:flex-col gap-1">
              {[80, 64, 72, 88].map((w, i) => (
                <div key={i} className="h-8 animate-pulse bg-hover/60 border border-border-color" style={{ width: `${w}%` }} />
              ))}
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div className="h-3.5 w-2/3 animate-pulse bg-border-color/50" />
              <div className="h-3 w-1/2 animate-pulse bg-border-color/40" />
              <div className="h-3 w-3/4 animate-pulse bg-border-color/40" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-[72px] min-h-screen">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        <h1 className="text-lg font-semibold tracking-wide uppercase mb-1">My Account</h1>
        <p className="text-xs text-text-secondary mb-8">Welcome back, {user.name}</p>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <nav className="md:w-48 shrink-0">
            <div className="flex md:flex-col gap-1 overflow-x-auto">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/account" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group text-xs px-1 py-2 whitespace-nowrap transition-all duration-150 underline-offset-[6px] decoration-1 ${
                      isActive
                        ? "text-foreground font-medium underline decoration-foreground"
                        : "text-text-secondary hover:pl-2 hover:text-foreground/60 hover:underline hover:decoration-foreground/60"
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
