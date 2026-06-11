"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, ReactNode } from "react";
import {
  clearAuthToken,
  getStoredAuthToken,
  getTokenExpiryMs,
  refreshAdminAuthToken,
  withAuthRequest,
} from "@/lib/authClient";

interface AdminUser { id: string; name: string; storeName?: string; storeType?: "thrift" | "retail" | null; storeApprovalStatus?: "pending" | "approved" | "rejected" | null; email: string; role: "admin" | "store_owner" | string; }

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

interface StoreNotice {
  id: string;
  storeId: string;
  title: string;
  detail: string;
  status: string;
  createdAt: string;
  read: boolean;
}

interface ProductNotice {
  id: string;
  productId: string;
  title: string;
  detail: string;
  status: string;
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
  | { type: "message:delete"; messageId: string }
  | {
      type: "store:upsert";
      store: {
        _id: string;
        name: string;
        storeName: string;
        email: string;
        category: string;
        categories?: string[];
        storeType: string;
        status: string;
        createdAt: string;
      };
    }
  | { type: "store:delete"; storeId: string }
  | {
      type: "product:upsert";
      product: {
        _id: string;
        name: string;
        brand: string;
        reference?: string;
        approvalStatus: string;
        createdAt: string;
        updatedAt?: string;
        visibilityStatus?: string;
        isActive?: boolean;
        changeType?: "created" | "updated";
        createdBy?: { id?: string; name?: string; email?: string } | null;
      };
    }
  | { type: "product:delete"; productId: string }
  | {
      type: "generated-image:update";
      asset: {
        _id: string;
        status: "processing" | "completed" | "failed";
        images: string[];
        errorMessage?: string;
      };
    };

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: "📊" },
  { name: "Home Page", href: "/dashboard/homepage", icon: "🏠" },
  { name: "Categories", href: "/dashboard/categories", icon: "🏷️" },
  { name: "Models", href: "/dashboard/models", icon: "🧍" },
  { name: "Prompts", href: "/dashboard/generated-image-prompts", icon: "✍️" },
  { name: "Generate Images", href: "/dashboard/generate-images", icon: "🖼️" },
  { name: "Products", href: "/dashboard/products", icon: "📦" },
  { name: "Orders", href: "/dashboard/orders", icon: "🛒" },
  { name: "Shipping Price", href: "/dashboard/shipping-price", icon: "🚚" },
  { name: "Coupons", href: "/dashboard/coupons", icon: "🏷️" },
  { name: "Users", href: "/dashboard/users", icon: "👥" },
  { name: "Newsletter", href: "/dashboard/newsletter", icon: "📧" },
  { name: "Messages", href: "/dashboard/messages", icon: "💬" },
  { name: "Stores", href: "/dashboard/stores", icon: "🏬" },
  { name: "Withdrawals", href: "/dashboard/withdrawals", icon: "💰" },
];

const storeOwnerNavItems = [
  navItems[0],
  navItems[6],
  navItems[7],
  { name: "Store Details", href: "/dashboard/store-details", icon: "🏬" },
  { name: "Balance", href: "/dashboard/balance", icon: "💰" },
  { name: "Transactions", href: "/dashboard/transactions", icon: "📜" },
];

const seenStoreIdsStorageKey = "looksmax-admin-seen-stores";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [orderNotifications, setOrderNotifications] = useState<OrderNotice[]>([]);
  const [messageNotifications, setMessageNotifications] = useState<MessageNotice[]>([]);
  const [storeNotifications, setStoreNotifications] = useState<StoreNotice[]>([]);
  const [productNotifications, setProductNotifications] = useState<ProductNotice[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const showNotificationsRef = useRef(showNotifications);
  const readOrderIdsRef = useRef<Set<string>>(new Set());
  const seenStoreIdsRef = useRef<Set<string>>(new Set());
  const refreshTimerRef = useRef<number | null>(null);
  const notificationAudioRef = useRef<AudioContext | null>(null);

  const clearRefreshTimer = () => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  const ensureNotificationAudio = useCallback(() => {
    if (typeof window === "undefined") return null;

    const AudioContextCtor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;

    if (!notificationAudioRef.current) {
      notificationAudioRef.current = new AudioContextCtor();
    }

    return notificationAudioRef.current;
  }, []);

  const unlockNotificationAudio = useCallback(async () => {
    const context = ensureNotificationAudio();
    if (!context || context.state === "running") return;

    try {
      await context.resume();
    } catch {
      // Autoplay restrictions can block the first resume attempt.
    }
  }, [ensureNotificationAudio]);

  const playNotificationSound = useCallback(() => {
    const context = ensureNotificationAudio();
    if (!context || context.state !== "running") return;

    const now = context.currentTime;

    // Three-note ascending chime: C6 → E6 → G6
    [
      { frequency: 1046.5, startOffset: 0,    duration: 0.5 },
      { frequency: 1318.5, startOffset: 0.15, duration: 0.45 },
      { frequency: 1568,   startOffset: 0.30, duration: 0.55 },
    ].forEach(({ frequency, startOffset, duration }) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + startOffset);

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.32, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + startOffset);
      oscillator.stop(now + startOffset + duration);

      window.setTimeout(() => {
        gain.disconnect();
      }, (startOffset + duration + 0.1) * 1000);
    });
  }, [ensureNotificationAudio]);

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

  const loadSeenStoreIds = () => {
    if (typeof window === "undefined") return new Set<string>();

    try {
      const raw = window.localStorage.getItem(seenStoreIdsStorageKey);
      if (!raw) return new Set<string>();

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set<string>();

      return new Set(parsed.filter((value): value is string => typeof value === "string"));
    } catch {
      return new Set<string>();
    }
  };

  const saveSeenStoreIds = (ids: Set<string>) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(seenStoreIdsStorageKey, JSON.stringify(Array.from(ids)));
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

  const formatStoreCategories = (categories?: string[], category?: string) => {
    const values = categories?.length ? categories : category ? [category] : [];
    return values
      .map((value) => value.replace(/[_-]+/g, " ").trim())
      .filter(Boolean)
      .join(", ");
  };

  const formatProductNotification = (product: {
    _id: string;
    name: string;
    brand: string;
    reference?: string;
    approvalStatus: string;
    createdAt: string;
    updatedAt?: string;
    visibilityStatus?: string;
    changeType?: "created" | "updated";
    createdBy?: { id?: string; name?: string; email?: string } | null;
  }) => {
    const eventAt = product.updatedAt || product.createdAt;
    if (product.approvalStatus === "pending") {
      return {
        title: product.changeType === "updated" ? "Product review updated" : "New product review",
        detail:
          product.changeType === "created"
            ? `${product.createdBy?.name || "Store owner"} • ${product.reference || product.brand || "Pending review"}`
            : `${product.name || "Product"} • Pending review`,
        createdAt: eventAt,
        read: false,
        status: product.approvalStatus,
      };
    }

    const visibilityLabel =
      product.visibilityStatus === "inactive" ? "Inactive" : "Active";

    return {
      title: "Product updated",
      detail: `${product.name || "Product"} • Visibility ${visibilityLabel}`,
      createdAt: eventAt,
      read: false,
      status: product.approvalStatus || "approved",
    };
  };

  useEffect(() => {
    let active = true;

    fetch(`/api/admin/auth/me?ts=${Date.now()}`, withAuthRequest({ cache: "no-store" }))
      .then((r) => r.json())
      .then(async (data) => {
        if (!active) return;
        if (!data.user) {
          clearAuthToken();
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
  }, [pathname, router]);

  useEffect(() => {
    showNotificationsRef.current = showNotifications;
  }, [showNotifications]);

  useEffect(() => {
    if (!user) return;

    const unlock = () => {
      void unlockNotificationAudio();
    };

    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [unlockNotificationAudio, user]);

  useEffect(() => {
    return () => {
      notificationAudioRef.current?.close().catch(() => {});
      notificationAudioRef.current = null;
    };
  }, []);

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
    if (!user) return;
    const currentUser = user;
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

    const loadPendingStores = async () => {
      try {
        const response = await fetch("/api/store-applications", withAuthRequest());
        const data = (await response.json()) as {
          stores?: Array<{
            _id: string;
            name: string;
            storeName: string;
            email: string;
            category: string;
            categories?: string[];
            storeType: string;
            status: string;
            createdAt: string;
          }>;
        };
        if (!active || !data) return;

        const pendingStores = (data.stores || []).filter((store) => store.status === "pending");
        const seenStoreIds = loadSeenStoreIds();
        seenStoreIdsRef.current = seenStoreIds;

        setStoreNotifications((current) => {
          const currentById = new Map(current.map((notice) => [notice.storeId, notice]));

          return pendingStores
            .filter((store) => !seenStoreIds.has(store._id))
            .map((store) => {
              const existing = currentById.get(store._id);

              return {
                id: existing?.id || store._id,
                storeId: store._id,
                title: store.storeName || store.name || "New store request",
                detail: `${store.name || "Owner"} • ${
                  formatStoreCategories(store.categories, store.category) || store.storeType || "Store request"
                }`,
                status: store.status,
                createdAt: store.createdAt,
                read: existing?.read ?? false,
              };
            })
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        });
      } catch {
        // Leave the current notification state untouched on polling failures.
      }
    };

    const loadPendingProducts = async () => {
      try {
        const response = await fetch("/api/products", withAuthRequest());
        const data = (await response.json()) as {
          products?: Array<{
            _id: string;
            name: string;
            brand: string;
            reference?: string;
            approvalStatus?: string;
            createdAt: string;
            updatedAt?: string;
            visibilityStatus?: string;
            changeType?: "created" | "updated";
            createdBy?: { id?: string; name?: string; email?: string } | null;
          }>;
        };
        if (!active || !data) return;

        const pendingProducts = (data.products || []).filter((product) => product.approvalStatus === "pending");

        setProductNotifications((current) => {
          const currentById = new Map(current.map((notice) => [notice.productId, notice]));

          return pendingProducts
            .map((product) => {
              const existing = currentById.get(product._id);
              const next = formatProductNotification({
                ...product,
                approvalStatus: product.approvalStatus || "pending",
                createdAt: product.createdAt,
              });

              return {
                id: existing?.id || product._id,
                productId: product._id,
                title: next.title,
                detail: next.detail,
                status: next.status,
                createdAt: next.createdAt,
                read: existing?.read ?? next.read,
              };
            })
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        });
      } catch {
        // Leave the current notification state untouched on polling failures.
      }
    };

    if (currentUser.role === "admin") {
      loadProcessingOrders();
      loadUnreadMessages();
      loadPendingStores();
      loadPendingProducts();
    }
    const eventSource = currentUser.role === "admin" ? new EventSource("/api/events") : null;
    if (eventSource) eventSource.onmessage = (event) => {
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

        playNotificationSound();
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

        playNotificationSound();
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
        return;
      }

      if (payload.type === "store:delete") {
        setStoreNotifications((current) =>
          current.filter((notice) => notice.storeId !== payload.storeId)
        );
        const seenStoreIds = loadSeenStoreIds();
        seenStoreIds.delete(payload.storeId);
        seenStoreIdsRef.current = seenStoreIds;
        saveSeenStoreIds(seenStoreIds);
        return;
      }

      if (payload.type === "store:upsert") {
        const store = payload.store;
        if (store.status !== "pending") {
          setStoreNotifications((current) =>
            current.filter((notice) => notice.storeId !== store._id)
          );
          const seenStoreIds = loadSeenStoreIds();
          seenStoreIds.delete(store._id);
          seenStoreIdsRef.current = seenStoreIds;
          saveSeenStoreIds(seenStoreIds);
          return;
        }

        const seenStoreIds = loadSeenStoreIds();
        if (seenStoreIds.has(store._id)) {
          setStoreNotifications((current) =>
            current.filter((notice) => notice.storeId !== store._id)
          );
          return;
        }

        playNotificationSound();
        setStoreNotifications((current) => {
          const currentById = new Map(current.map((notice) => [notice.storeId, notice]));
          const existing = currentById.get(store._id);

          return [
            {
              id: existing?.id || store._id,
              storeId: store._id,
              title: store.storeName || store.name || "New store request",
              detail: `${store.name || "Owner"} • ${
                formatStoreCategories(store.categories, store.category) || store.storeType || "Store request"
              }`,
              status: store.status,
              createdAt: store.createdAt,
              read: existing?.read ?? false,
            },
            ...current.filter((notice) => notice.storeId !== store._id),
          ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        });
        return;
      }

      if (payload.type === "product:delete") {
        setProductNotifications((current) =>
          current.filter((notice) => notice.productId !== payload.productId)
        );
        return;
      }

      if (payload.type === "generated-image:update") {
        window.dispatchEvent(
          new CustomEvent("looksmax-admin-generated-image-event", { detail: payload.asset })
        );
        return;
      }

      if (payload.type === "product:upsert") {
        const product = payload.product;
        const next = formatProductNotification({
          ...product,
          approvalStatus: product.approvalStatus || "pending",
          createdAt: product.createdAt,
        });

        playNotificationSound();
        setProductNotifications((current) => {
          const currentById = new Map(current.map((notice) => [notice.productId, notice]));
          const existing = currentById.get(product._id);

          return [
            {
              id: existing?.id || product._id,
              productId: product._id,
              title: next.title,
              detail: next.detail,
              status: next.status,
              createdAt: next.createdAt,
              read: false,
            },
            ...current.filter((notice) => notice.productId !== product._id),
          ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        });
      }
    };
    if (eventSource) eventSource.onerror = () => {
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
      eventSource?.close();
      document.removeEventListener("mousedown", handlePointerDown);
      clearRefreshTimer();
    };
  }, [user]);

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
  const isAdminUser = user?.role === "admin";
  const unreadMessageCount = isAdminUser ? messageNotifications.filter((notice) => !notice.read).length : 0;
  const unreadStoreCount = isAdminUser ? storeNotifications.filter((notice) => !notice.read).length : 0;
  const unreadProductCount = isAdminUser ? productNotifications.filter((notice) => !notice.read).length : 0;
  const unreadTotalCount = isAdminUser
    ? unreadNotificationCount + unreadMessageCount + unreadStoreCount + unreadProductCount
    : 0;
  const showBackButton = pathname !== "/dashboard";

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

  const handleStoreNotificationClick = (notice: StoreNotice) => {
    const seenStoreIds = loadSeenStoreIds();
    seenStoreIds.add(notice.storeId);
    seenStoreIdsRef.current = seenStoreIds;
    saveSeenStoreIds(seenStoreIds);

    setStoreNotifications((current) =>
      current.map((storeNotice) =>
        storeNotice.storeId === notice.storeId ? { ...storeNotice, read: true } : storeNotice
      )
    );
    setShowNotifications(false);
    router.push(`/dashboard/stores?storeId=${encodeURIComponent(notice.storeId)}`);
  };

  const handleProductNotificationClick = (notice: ProductNotice) => {
    setProductNotifications((current) =>
      current.map((productNotice) =>
        productNotice.productId === notice.productId ? { ...productNotice, read: true } : productNotice
      )
    );
    setShowNotifications(false);
    router.push(`/dashboard/products/${notice.productId}`);
  };

  const handleLogout = async () => {
    clearRefreshTimer();
    clearAuthToken();
    setUser(null);
    await fetch("/api/admin/auth/logout", withAuthRequest({ method: "POST" }));
    router.replace("/");
    router.refresh();
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <p className="text-xs text-text-secondary uppercase tracking-wider animate-pulse">Loading...</p>
    </div>
  );

  if (!user) return null;

  const visibleNavItems = user.role === "store_owner" ? storeOwnerNavItems : navItems;

  return (
    <div className="min-h-screen bg-bg-primary md:flex print:block print:bg-white print:text-black">
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
              <h1 className="text-xs font-semibold tracking-[0.3em] uppercase text-text-primary">
                LOOKSMAX
              </h1>
              <p className="text-[9px] text-text-secondary uppercase tracking-wider">
                {user.role === "store_owner" && user.storeName ? user.storeName : "Admin"}
              </p>
            </div>
          )}
          <button onClick={() => setSidebarOpen((p) => !p)} className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer text-sm">
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 text-xs transition-colors border-l-2 ${
                  isActive
                    ? "bg-bg-hover text-text-primary font-medium border-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-hover border-transparent"
                }`}
              >
                <span className="text-sm">{item.icon}</span>
                {sidebarOpen && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border/60 p-2 md:hidden">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-danger transition-colors hover:bg-bg-hover hover:text-danger/80 cursor-pointer"
          >
            <span className="text-sm">↩</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto print:overflow-visible print:w-full print:bg-white">
        <div className="sticky top-0 z-20 border-b border-border/60 bg-bg-primary/80 px-4 py-3 backdrop-blur md:px-6 print:hidden">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end md:gap-4">
            <div className="flex items-center justify-between gap-3 md:mr-auto">
              {showBackButton && (
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="inline-flex items-center gap-2 border border-border bg-bg-secondary/40 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
                >
                  <span>←</span>
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => setMobileSidebarOpen((current) => !current)}
                className="inline-flex items-center gap-2 border border-border bg-bg-secondary/40 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary md:hidden"
              >
                <span>☰</span>
                Menu
              </button>
            </div>

            {isAdminUser && (
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
                {showNotifications &&
                  (orderNotifications.length > 0 ||
                    messageNotifications.length > 0 ||
                    storeNotifications.length > 0 ||
                    productNotifications.length > 0) && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-72 border border-border bg-bg-secondary/95 p-3 shadow-lg shadow-black/10 max-h-[80vh] overflow-y-auto">
                    {productNotifications.length > 0 && (
                      <>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
                            Product Updates
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setProductNotifications((current) =>
                                current.map((notice) => ({ ...notice, read: true }))
                              );
                            }}
                            className="text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:text-text-primary cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="space-y-2">
                          {productNotifications.map((notice) => (
                            <button
                              key={notice.id}
                              type="button"
                              onClick={() => handleProductNotificationClick(notice)}
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

                    {storeNotifications.length > 0 && (
                      <>
                        <div className={productNotifications.length > 0 ? "mt-4 mb-2 flex items-center justify-between" : "mb-2 flex items-center justify-between"}>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
                            Pending Store Requests
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const seenStoreIds = new Set(loadSeenStoreIds());
                              for (const notice of storeNotifications) {
                                seenStoreIds.add(notice.storeId);
                              }
                              seenStoreIdsRef.current = seenStoreIds;
                              saveSeenStoreIds(seenStoreIds);
                              setStoreNotifications((current) =>
                                current.map((notice) => ({ ...notice, read: true }))
                              );
                            }}
                            className="text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:text-text-primary cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="space-y-2">
                          {storeNotifications.map((notice) => (
                            <button
                              key={notice.id}
                              type="button"
                              onClick={() => handleStoreNotificationClick(notice)}
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

                    {orderNotifications.length > 0 && (
                      <div className={productNotifications.length > 0 || storeNotifications.length > 0 ? "mt-4" : ""}>
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

                    {messageNotifications.length > 0 && (
                      <div className={productNotifications.length > 0 || storeNotifications.length > 0 || orderNotifications.length > 0 ? "mt-4" : ""}>
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
            )}

            <p className="hidden min-w-0 text-[10px] uppercase tracking-[0.16em] text-text-secondary truncate text-right md:block">
              {user.email}
            </p>

            <button
              onClick={handleLogout}
              className="hidden px-0 py-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-danger transition-colors hover:text-danger/80 cursor-pointer md:block"
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
