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

  if (loading) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Redirecting to login...</p>
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
                    className={`text-xs px-3 py-2 whitespace-nowrap transition-colors ${
                      isActive
                        ? "bg-foreground text-background font-medium"
                        : "text-text-secondary hover:text-foreground hover:bg-hover"
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
