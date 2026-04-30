"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, ReactNode } from "react";
import {
  clearAuthToken,
  getStoredAuthToken,
  getTokenExpiryMs,
  refreshAdminAuthToken,
  withAuthRequest,
} from "@/lib/authClient";

interface AdminUser { id: string; name: string; email: string; role: string; }

interface DashboardOrder {
  _id: string;
  orderStatus: string;
  createdAt: string;
  user?: { name: string; email: string };
  totalPrice?: number;
  isArchived?: boolean;
  items?: { product?: string; name: string; quantity: number }[];
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

interface MessageNotice {
  id: string;
  messageId: string;
  title: string;
  detail: string;
  createdAt: string;
  read: boolean;
}

type AdminRealtimeEvent =
  | { type: "connected" }
  | { type: "order:upsert"; order: DashboardOrder }
  | { type: "order:delete"; orderId: string }
  | {
      type: "message:upsert";
      message: {
        _id: string;
        name: string;
        email: string;
        subject: string;
        message: string;
        isRead: boolean;
        createdAt: string;
      };
    }
  | { type: "message:delete"; messageId: string };

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: "📊" },
  { name: "Home Page", href: "/dashboard/homepage", icon: "🏠" },
  { name: "Categories", href: "/dashboard/categories", icon: "🏷️" },
  { name: "Models", href: "/dashboard/models", icon: "🧍" },
  { name: "Prompts", href: "/dashboard/generated-image-prompts", icon: "✍️" },
  { name: "Generate Images", href: "/dashboard/generate-images", icon: "🖼️" },
  { name: "Products", href: "/dashboard/products", icon: "📦" },
  { name: "Stores", href: "/dashboard/stores", icon: "🏬" },
  { name: "Orders", href: "/dashboard/orders", icon: "🛒" },
  { name: "Shipping Price", href: "/dashboard/shipping-price", icon: "🚚" },
  { name: "Coupons", href: "/dashboard/coupons", icon: "🏷️" },
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
  const [messageNotifications, setMessageNotifications] = useState<MessageNotice[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const showNotificationsRef = useRef(showNotifications);
  const readOrderIdsRef = useRef<Set<string>>(new Set());
  const refreshTimerRef = useRef<number | null>(null);

  const clearRefreshTimer = () => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  const scheduleTokenRefresh = (token?: string | null) => {
    clearRefreshTimer();

    const currentToken = token || getStoredAuthToken();
    if (!currentToken) return;

    const expiryMs = getTokenExpiryMs(currentToken);
    if (!expiryMs) return;

    const refreshLeadMs = 2 * 60 * 1000;
    const delayMs = Math.max(expiryMs - Date.now() - refreshLeadMs, 60 * 1000);

    refreshTimerRef.current = window.setTimeout(async () => {
      try {
        const nextToken = await refreshAdminAuthToken();
        if (!nextToken) {
          clearAuthToken();
          router.push("/");
          return;
        }
        scheduleTokenRefresh(nextToken);
      } catch {
        clearAuthToken();
        router.push("/");
      }
    }, delayMs);
  };

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

  const markMessageRead = async (notice: MessageNotice) => {
    setMessageNotifications((current) =>
      current.map((messageNotice) =>
        messageNotice.messageId === notice.messageId ? { ...messageNotice, read: true } : messageNotice
      )
    );

    try {
      await fetch(
        "/api/messages",
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: notice.messageId, isRead: true }),
        })
      );
    } catch {
      // Keep the optimistic UI update. The messages page can reconcile later if needed.
    }
  };

  useEffect(() => {
    let active = true;

    fetch("/api/auth/me", withAuthRequest())
      .then((r) => r.json())
      .then(async (data) => {
        if (!active) return;
        if (!data.user) {
          router.push("/");
          return;
        }

        setUser(data.user);
        try {
          const refreshedToken = await refreshAdminAuthToken();
          if (refreshedToken) {
            scheduleTokenRefresh(refreshedToken);
          } else {
            scheduleTokenRefresh();
          }
        } catch {
          scheduleTokenRefresh();
        }
      })
      .catch(() => router.push("/"))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      clearRefreshTimer();
    };
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
        const response = await fetch("/api/orders", withAuthRequest());
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

    const loadUnreadMessages = async () => {
      try {
        const response = await fetch("/api/messages", withAuthRequest());
        const data = (await response.json()) as { messages?: Array<{ _id: string; name: string; email: string; subject: string; message: string; isRead?: boolean; createdAt: string }> };
        if (!active || !data) return;

        const unreadMessages = (data.messages || []).filter((message) => !message.isRead);

        setMessageNotifications((current) => {
          const currentById = new Map(current.map((notice) => [notice.messageId, notice]));

          return unreadMessages
            .map((message) => {
              const existing = currentById.get(message._id);
              const createdAt = message.createdAt;

              return {
                id: existing?.id || message._id,
                messageId: message._id,
                title: message.subject || "New message",
                detail: `${message.name || "Customer"} • ${message.email || "No email"}`,
                createdAt,
                read: existing?.read ?? false,
              };
            })
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        });
      } catch {
        // Leave the current notification state untouched on polling failures.
      }
    };

    loadProcessingOrders();
    loadUnreadMessages();
    const eventSource = new EventSource("/api/events");
    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as AdminRealtimeEvent;
      if (payload.type === "connected") return;

      if (payload.type === "order:delete") {
        setOrderNotifications((current) =>
          current.filter((notice) => notice.orderId !== payload.orderId)
        );
        window.dispatchEvent(new CustomEvent("looksmax-admin-order-event", { detail: payload }));
        return;
      }

      if (payload.type === "order:upsert") {
        const order = payload.order;
        window.dispatchEvent(new CustomEvent("looksmax-admin-order-event", { detail: payload }));

        if (order.orderStatus !== "processing") {
          setOrderNotifications((current) =>
            current.filter((notice) => notice.orderId !== order._id)
          );
          return;
        }

        setOrderNotifications((current) => {
          const currentById = new Map(current.map((notice) => [notice.orderId, notice]));
          const existing = currentById.get(order._id);
          const readOrderIds = readOrderIdsRef.current;

          return [
            {
              id: existing?.id || order._id,
              orderId: order._id,
              title: `Order #${order._id.slice(-8).toUpperCase()}`,
              detail:
                order.user?.name || order.user?.email
                  ? `${order.user?.name || "Customer"} • ${order.user?.email || "No email"}`
                  : "Processing order",
              latestOrderAt: order.createdAt,
              read: existing?.read ?? readOrderIds.has(order._id),
              createdAt: order.createdAt,
            },
            ...current.filter((notice) => notice.orderId !== order._id),
          ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        });
        return;
      }

      if (payload.type === "message:delete") {
        setMessageNotifications((current) =>
          current.filter((notice) => notice.messageId !== payload.messageId)
        );
        window.dispatchEvent(new CustomEvent("looksmax-admin-message-event", { detail: payload }));
        return;
      }

      if (payload.type === "message:upsert") {
        const message = payload.message;
        window.dispatchEvent(new CustomEvent("looksmax-admin-message-event", { detail: payload }));

        if (message.isRead) {
          setMessageNotifications((current) =>
            current.filter((notice) => notice.messageId !== message._id)
          );
          return;
        }

        setMessageNotifications((current) => {
          const currentById = new Map(current.map((notice) => [notice.messageId, notice]));
          const existing = currentById.get(message._id);

          return [
            {
              id: existing?.id || message._id,
              messageId: message._id,
              title: message.subject || "New message",
              detail: `${message.name || "Customer"} • ${message.email || "No email"}`,
              createdAt: message.createdAt,
              read: existing?.read ?? false,
            },
            ...current.filter((notice) => notice.messageId !== message._id),
          ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        });
      }
    };
    eventSource.onerror = () => {
      // EventSource reconnects automatically.
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (!showNotificationsRef.current) return;
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      active = false;
      eventSource.close();
      document.removeEventListener("mousedown", handlePointerDown);
      clearRefreshTimer();
    };
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

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
  const unreadMessageCount = messageNotifications.filter((notice) => !notice.read).length;
  const unreadTotalCount = unreadNotificationCount + unreadMessageCount;

  const handleNotificationClick = (notice: OrderNotice) => {
    markNotificationRead(notice.id);
    setShowNotifications(false);
    router.push(`/dashboard/orders/${notice.orderId}`);
  };

  const handleMessageNotificationClick = (notice: MessageNotice) => {
    void markMessageRead(notice);
    setShowNotifications(false);
    router.push("/dashboard/messages");
  };

  const handleLogout = async () => {
    clearRefreshTimer();
    clearAuthToken();
    setUser(null);
    await fetch("/api/auth/logout", withAuthRequest({ method: "POST" }));
    router.replace("/");
    router.refresh();
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <p className="text-xs text-text-secondary uppercase tracking-wider animate-pulse">Loading...</p>
    </div>
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-bg-primary md:flex print:block print:bg-white print:text-black print:[&_*:not(.print\\:block)]:hidden">
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col shrink-0 bg-bg-secondary/90 backdrop-blur md:static md:z-auto md:backdrop-blur-0 print:hidden transition-transform duration-300 md:transition-[width] ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 ${sidebarOpen ? "md:w-56" : "md:w-16"}`}
      >
        <div className="flex items-center justify-between p-4">
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

      <main className="flex-1 overflow-y-auto print:overflow-visible print:w-full print:bg-white">
        <div className="sticky top-0 z-20 border-b border-border/60 bg-bg-primary/80 px-4 py-3 backdrop-blur md:px-6 print:hidden">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end md:gap-4">
            <div className="flex items-center justify-between gap-3 md:mr-auto">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen((current) => !current)}
                className="inline-flex items-center gap-2 border border-border bg-bg-secondary px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-text-secondary transition-colors hover:text-text-primary md:hidden"
              >
                <span>☰</span>
                Menu
              </button>
              <button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                className="hidden md:inline-flex items-center gap-2 border border-border bg-bg-secondary px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-text-secondary transition-colors hover:text-text-primary"
              >
                {sidebarOpen ? "Collapse" : "Expand"}
              </button>
            </div>

            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setShowNotifications((current) => !current)}
                className="flex items-center gap-2 text-right text-[10px] uppercase tracking-[0.18em] text-text-secondary transition-colors hover:text-text-primary cursor-pointer"
              >
                <span className="text-sm">🔔</span>
                <span>Notifications</span>
                {unreadTotalCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[9px] font-semibold text-bg-primary">
                    {unreadTotalCount}
                  </span>
                )}
              </button>
              {showNotifications && (orderNotifications.length > 0 || messageNotifications.length > 0) && (
                <div className="absolute right-0 top-full z-20 mt-2 w-72 border border-border bg-bg-secondary/95 p-3 shadow-lg shadow-black/10">
                  {orderNotifications.length > 0 && (
                    <>
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
                    </>
                  )}

                  {messageNotifications.length > 0 && (
                    <div className={orderNotifications.length > 0 ? "mt-4" : ""}>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">Unread Messages</p>
                        <button
                          type="button"
                          onClick={() => setMessageNotifications([])}
                          className="text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:text-text-primary cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="space-y-2">
                        {messageNotifications.map((notice) => (
                          <button
                            key={notice.id}
                            type="button"
                            onClick={() => handleMessageNotificationClick(notice)}
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

        <div className="p-4 md:p-6 lg:p-8 print:p-0 print:!m-0 print:!bg-white print:!backdrop-blur-0 print:w-full print:block">{children}</div>
      </main>
    </div>
  );
}
