"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, ReactNode } from "react";

interface AdminUser { id: string; name: string; email: string; role: string; }

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: "📊" },
  { name: "Home Page", href: "/dashboard/homepage", icon: "🏠" },
  { name: "Categories", href: "/dashboard/categories", icon: "🏷️" },
  { name: "Models", href: "/dashboard/models", icon: "🧍" },
  { name: "Generate Images", href: "/dashboard/generate-images", icon: "🖼️" },
  { name: "Products", href: "/dashboard/products", icon: "📦" },
  { name: "Orders", href: "/dashboard/orders", icon: "🛒" },
  { name: "Users", href: "/dashboard/users", icon: "👥" },
  { name: "Newsletter", href: "/dashboard/newsletter", icon: "📧" },
  { name: "Messages", href: "/dashboard/messages", icon: "💬" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => {
      if (!data.user) { router.push("/"); return; }
      setUser(data.user);
    }).catch(() => router.push("/")).finally(() => setLoading(false));
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <p className="text-xs text-text-secondary uppercase tracking-wider animate-pulse">Loading...</p>
    </div>
  );

  if (!user) return null;

  return (
    <div className="min-h-screen flex bg-bg-primary">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-56" : "w-16"} transition-all duration-300 bg-bg-secondary border-r border-border flex flex-col shrink-0`}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          {sidebarOpen && (
            <div>
              <h1 className="text-xs font-bold tracking-[0.2em] uppercase text-accent">LOOKSMAX</h1>
              <p className="text-[9px] text-text-secondary uppercase tracking-wider">Admin</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen((p) => !p)} className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer text-sm">
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded text-xs transition-colors ${
                  isActive ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                }`}
              >
                <span className="text-sm">{item.icon}</span>
                {sidebarOpen && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          {sidebarOpen && (
            <div className="mb-3">
              <p className="text-xs font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-[10px] text-text-secondary truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full text-left text-xs text-danger hover:text-danger/80 transition-colors cursor-pointer"
          >
            {sidebarOpen ? "Sign Out" : "🚪"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
