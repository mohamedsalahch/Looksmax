"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, ReactNode } from "react";

interface AdminUser { id: string; name: string; email: string; role: string; }

interface DashboardOrder {
  _id: string;
  orderStatus: string;
  createdAt: string;
  user?: { name: string; email: string };
  totalPrice?: number;
}

interface OrderNotice {
  id: string;
  orderId: string;
  title: string;
  detail: string;
  latestOrderAt: string | null;
  read: boolean;
  createdAt: string;
}

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
  const [orderNotifications, setOrderNotifications] = useState<OrderNotice[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const showNotificationsRef = useRef(showNotifications);
  const readOrderIdsRef = useRef<Set<string>>(new Set());

  const loadReadOrderIds = () => {
    if (typeof window === "undefined") return new Set<string>();

    try {
      const raw = window.localStorage.getItem("looksmax-admin-read-orders");
      if (!raw) return new Set<string>();

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set<string>();

      return new Set(parsed.filter((value): value is string => typeof value === "string"));
    } catch {
      return new Set<string>();
    }
  };

  const saveReadOrderIds = (ids: Set<string>) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("looksmax-admin-read-orders", JSON.stringify(Array.from(ids)));
  };

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => {
      if (!data.user) { router.push("/"); return; }
      setUser(data.user);
    }).catch(() => router.push("/")).finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    showNotificationsRef.current = showNotifications;
  }, [showNotifications]);

  useEffect(() => {
    const match = pathname.match(/^\/dashboard\/orders\/([^/]+)$/);
    if (!match) return;

    const orderId = match[1];
    const readOrderIds = loadReadOrderIds();
    readOrderIds.add(orderId);
    readOrderIdsRef.current = readOrderIds;
    saveReadOrderIds(readOrderIds);

    setOrderNotifications((current) =>
      current.map((notice) => (notice.orderId === orderId ? { ...notice, read: true } : notice))
    );
  }, [pathname]);

  useEffect(() => {
    let active = true;

    const loadProcessingOrders = async () => {
      try {
        const response = await fetch("/api/orders");
        const data = (await response.json()) as { orders?: DashboardOrder[] };
        if (!active || !data) return;

        const processingOrders = (data.orders || []).filter((order) => order.orderStatus === "processing");

        setOrderNotifications((current) => {
          const currentById = new Map(current.map((notice) => [notice.orderId, notice]));
          const readOrderIds = loadReadOrderIds();
          readOrderIdsRef.current = readOrderIds;

          return processingOrders.map((order) => {
            const existing = currentById.get(order._id);
            const createdAt = order.createdAt;

            return {
              id: existing?.id || order._id,
              orderId: order._id,
              title: `Order #${order._id.slice(-8).toUpperCase()}`,
              detail:
                order.user?.name || order.user?.email
                  ? `${order.user?.name || "Customer"} • ${order.user?.email || "No email"}`
                  : "Processing order",
              latestOrderAt: createdAt,
              read: existing?.read ?? readOrderIds.has(order._id),
              createdAt,
            };
          }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        });
      } catch {
        // Leave the current notification state untouched on polling failures.
      }
    };

    loadProcessingOrders();
    const interval = window.setInterval(loadProcessingOrders, 20000);
    const handlePointerDown = (event: MouseEvent) => {
      if (!showNotificationsRef.current) return;
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const markNotificationRead = (noticeId: string) => {
    setOrderNotifications((current) => {
      const next = current.map((notice) => {
        if (notice.id !== noticeId) return notice;
        readOrderIdsRef.current.add(notice.orderId);
        return { ...notice, read: true };
      });

      saveReadOrderIds(readOrderIdsRef.current);
      return next;
    });
  };

  const unreadNotificationCount = orderNotifications.filter((notice) => !notice.read).length;

  const handleNotificationClick = (notice: OrderNotice) => {
    markNotificationRead(notice.id);
    setShowNotifications(false);
    router.push(`/dashboard/orders/${notice.orderId}`);
  };

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
      <aside className={`${sidebarOpen ? "w-56" : "w-16"} transition-all duration-300 bg-bg-secondary/65 flex flex-col shrink-0`}>
        <div className="p-4 flex items-center justify-between">
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
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="bg-bg-primary/70 px-6 py-4 backdrop-blur md:px-8">
          <div className="flex items-center justify-end gap-4">
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setShowNotifications((current) => !current)}
                className="flex items-center gap-2 text-right text-[10px] uppercase tracking-[0.18em] text-text-secondary transition-colors hover:text-text-primary cursor-pointer"
              >
                <span className="text-sm">🔔</span>
                <span>Notifications</span>
                {unreadNotificationCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[9px] font-semibold text-bg-primary">
                    {unreadNotificationCount}
                  </span>
                )}
              </button>
              {showNotifications && orderNotifications.length > 0 && (
                <div className="absolute right-0 top-full z-20 mt-2 w-72 border border-border bg-bg-secondary/95 p-3 shadow-lg shadow-black/10">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">Processing Orders</p>
                    <button
                      type="button"
                      onClick={() => setOrderNotifications([])}
                      className="text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:text-text-primary cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-2">
                    {orderNotifications.map((notice) => (
                      <button
                        key={notice.id}
                        type="button"
                        onClick={() => handleNotificationClick(notice)}
                        className="flex w-full items-start gap-2 border border-border bg-bg-primary/80 px-3 py-2 text-left transition-colors hover:bg-bg-hover"
                      >
                        {!notice.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-text-primary">{notice.title}</span>
                          <span className="block text-[10px] text-text-secondary">{notice.detail}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="min-w-0 text-[10px] uppercase tracking-[0.16em] text-text-secondary truncate text-right">
              {user.email}
            </p>

            <button
              onClick={handleLogout}
              className="px-0 py-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-danger transition-colors hover:text-danger/80 cursor-pointer"
            >
              Logout
            </button>
            </div>
        </div>

        <div className="p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
