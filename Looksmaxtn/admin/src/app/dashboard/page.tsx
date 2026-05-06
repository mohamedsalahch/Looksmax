"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

type DashboardScope = "admin" | "store";
type OrderStatus = "processing" | "confirmed" | "shipping" | "delivered" | "canceled" | "returned" | string;
type ApprovalStatus = "pending" | "approved" | "rejected" | string;

interface DashboardStats {
  totalProducts: number;
  totalOrders: number;
  totalUsers: number;
  totalRevenue: number;
  pendingOrders: number;
  scope?: DashboardScope;
  storeName?: string;
}

interface DashboardProduct {
  _id: string;
  name: string;
  brand: string;
  reference?: string;
  createdAt: string;
  updatedAt?: string;
  approvalStatus?: ApprovalStatus;
  visibilityStatus?: string;
  isActive?: boolean;
  createdBy?: { id?: string; name?: string; email?: string } | null;
}

interface DashboardOrder {
  _id: string;
  orderStatus: OrderStatus;
  createdAt: string;
  totalPrice?: number;
  user?: { name: string; email: string } | null;
  items?: { product?: string; name: string; quantity: number }[];
}

interface StoreApplication {
  _id: string;
  name: string;
  storeName: string;
  email: string;
  category: string;
  categories?: string[];
  storeType?: string;
  status: string;
  createdAt: string;
}

interface StoreCredits {
  allowed: number;
  used: number;
  remaining: number;
}

function formatMoney(value: number) {
  return `${value.toFixed(2)} TND`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function getApprovalBadge(status?: ApprovalStatus) {
  switch (status) {
    case "pending":
      return { label: "Pending", className: "bg-warning/10 text-warning" };
    case "rejected":
      return { label: "Rejected", className: "bg-danger/10 text-danger" };
    case "approved":
    default:
      return { label: "Approved", className: "bg-bg-secondary text-text-secondary" };
  }
}

function getOrderBadge(status: OrderStatus) {
  switch (status) {
    case "processing":
      return { label: "Processing", className: "bg-warning/10 text-warning" };
    case "confirmed":
      return { label: "Confirmed", className: "bg-info/10 text-info" };
    case "shipping":
      return { label: "Shipping", className: "bg-accent/10 text-accent" };
    case "delivered":
      return { label: "Delivered", className: "bg-success/10 text-success" };
    case "canceled":
      return { label: "Canceled", className: "bg-danger/10 text-danger" };
    case "returned":
      return { label: "Returned", className: "bg-neutral-200 text-neutral-700" };
    default:
      return { label: status || "Pending", className: "bg-bg-secondary text-text-secondary" };
  }
}

function getStoreTypeLabel(value?: string) {
  if (value === "thrift") return "Thrift Store";
  if (value === "retail") return "Retail Store";
  return "Store";
}

function DashboardStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  icon: string;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-1 py-5 px-4 sm:px-6">
      <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary">{value}</span>
      <span className={`label-meta ${tone}`}>{label}</span>
    </div>
  );
}

function QueuePanel({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3 mb-1">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-primary">{title}</h2>
          <p className="hidden sm:block text-[11px] text-text-secondary">{description}</p>
        </div>
        <span className="label-meta tabular-nums">{count}</span>
      </div>
      <div>{children}</div>
    </section>
  );
}

function PendingCard({
  href,
  title,
  subtitle,
  badgeLabel,
  badgeClassName,
  metaLeft,
  metaRight,
}: {
  href: string;
  title: string;
  subtitle: string;
  badgeLabel: string;
  badgeClassName: string;
  metaLeft: string;
  metaRight?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 border-b border-border py-3 transition-colors hover:bg-bg-secondary/50 px-1 -mx-1"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="truncate text-sm text-text-primary">{title}</p>
          <span className={`shrink-0 text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${badgeClassName}`}>
            {badgeLabel}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-text-secondary truncate">{subtitle}</p>
        {metaRight && (
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-secondary sm:hidden">{metaRight}</p>
        )}
      </div>
      <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 text-right">
        <span className="text-[10px] uppercase tracking-wider text-text-secondary">{metaLeft}</span>
        {metaRight && <span className="text-[10px] uppercase tracking-wider text-text-secondary">{metaRight}</span>}
      </div>
    </Link>
  );
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, withAuthRequest());
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) return null;
    return data;
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [stores, setStores] = useState<StoreApplication[]>([]);
  const [credits, setCredits] = useState<StoreCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      try {
        const statsResponse = await fetch("/api/stats", withAuthRequest());
        const statsData = (await statsResponse.json()) as DashboardStats & { error?: string };
        if (!statsResponse.ok) {
          throw new Error(statsData.error || "Failed to load dashboard");
        }

        if (!active) return;

        const nextStats: DashboardStats = {
          totalProducts: Number(statsData.totalProducts || 0),
          totalOrders: Number(statsData.totalOrders || 0),
          totalUsers: Number(statsData.totalUsers || 0),
          totalRevenue: Number(statsData.totalRevenue || 0),
          pendingOrders: Number(statsData.pendingOrders || 0),
          scope: statsData.scope,
          storeName: statsData.storeName,
        };

        setStats(nextStats);

        const scope: DashboardScope = nextStats.scope === "store" ? "store" : "admin";
        const [productsData, ordersData, storesData, creditsData] = await Promise.all([
          fetchJson<{ products?: DashboardProduct[] }>("/api/products"),
          fetchJson<{ orders?: DashboardOrder[] }>("/api/orders"),
          scope === "admin" ? fetchJson<{ stores?: StoreApplication[] }>("/api/store-applications") : Promise.resolve(null),
          scope === "store" ? fetchJson<StoreCredits>("/api/users/me/store-credits") : Promise.resolve(null),
        ]);

        if (!active) return;

        setProducts(productsData?.products || []);
        setOrders(ordersData?.orders || []);
        setStores(storesData?.stores || []);
        setCredits(creditsData || null);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDashboard();

    return () => { active = false; };
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (loading || !stats) return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-text-secondary animate-pulse">
      <span className="inline-block h-px w-8 bg-border" />
      Loading dashboard
    </div>
  );

  const scope = stats.scope === "store" ? "store" : "admin";
  const isStoreDashboard = scope === "store";

  const pendingProducts = products
    .filter((product) => product.approvalStatus === "pending")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);
  const pendingOrders = orders
    .filter((order) => order.orderStatus === "processing" || order.orderStatus === "confirmed")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);
  const pendingStores = stores
    .filter((store) => store.status === "pending")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);

  const cards = isStoreDashboard
    ? [
        { label: "Total Revenue", value: formatMoney(stats.totalRevenue), icon: "💰", tone: "text-text-secondary" },
        { label: "Products", value: stats.totalProducts, icon: "📦", tone: "text-text-secondary" },
        { label: "Pending Products", value: pendingProducts.length, icon: "⏳", tone: "text-warning" },
        { label: "Orders", value: stats.totalOrders, icon: "🛒", tone: "text-text-secondary" },
        { label: "Pending Orders", value: pendingOrders.length, icon: "🔔", tone: "text-danger" },
        ...(credits
          ? [{ label: "Credits Remaining", value: credits.remaining, icon: "💳", tone: "text-text-secondary" }]
          : []),
      ]
    : [
        { label: "Products", value: stats.totalProducts, icon: "📦", tone: "text-text-secondary" },
        { label: "Pending Products", value: pendingProducts.length, icon: "⏳", tone: "text-warning" },
        { label: "Stores", value: stores.length, icon: "🏬", tone: "text-text-secondary" },
        { label: "Pending Stores", value: pendingStores.length, icon: "🧾", tone: "text-danger" },
        { label: "Orders", value: stats.totalOrders, icon: "🛒", tone: "text-text-secondary" },
        { label: "Pending Orders", value: pendingOrders.length, icon: "🔔", tone: "text-warning" },
      ];

  return (
    <div className="space-y-10">

      {/* ── Hero ── */}
      <div>
        <p className="label-meta mb-3">Dashboard</p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-wide uppercase text-text-primary">
          {isStoreDashboard && stats.storeName ? stats.storeName : "Overview"}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-secondary">
          {isStoreDashboard
            ? "Track revenue, products, orders, and pending reviews for your store."
            : "Focus on operations first: products needing review, pending store applications, and orders waiting on action."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="border border-border px-3 py-1 text-[10px] uppercase tracking-wider text-text-secondary">
            {isStoreDashboard ? "Store view" : "Admin view"}
          </span>
          <span className="border border-border px-3 py-1 text-[10px] uppercase tracking-wider text-text-secondary">
            {isStoreDashboard ? "Revenue included" : "Revenue hidden"}
          </span>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="border-t border-b border-border">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {cards.map((card) => (
            <DashboardStatCard
              key={card.label}
              label={card.label}
              value={card.value}
              icon={card.icon}
              tone={card.tone}
            />
          ))}
        </div>
      </div>

      {/* ── Queues ── */}
      {isStoreDashboard ? (
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-2">
          <QueuePanel
            title="Product Reviews"
            description="Products waiting for approval."
            count={pendingProducts.length}
          >
            {pendingProducts.length > 0 ? (
              pendingProducts.map((product) => {
                const badge = getApprovalBadge(product.approvalStatus || "pending");
                return (
                  <PendingCard
                    key={product._id}
                    href={`/dashboard/products/${product._id}`}
                    title={product.name}
                    subtitle={`${product.brand}${product.reference ? ` · ${product.reference}` : ""}`}
                    badgeLabel={badge.label}
                    badgeClassName={badge.className}
                    metaLeft={formatDateTime(product.createdAt)}
                    metaRight={product.visibilityStatus ?? "pending"}
                  />
                );
              })
            ) : (
              <p className="py-4 text-xs text-text-secondary">No products waiting for review.</p>
            )}
          </QueuePanel>

          <QueuePanel
            title="Order Pipeline"
            description="Orders still moving through confirmation."
            count={pendingOrders.length}
          >
            {pendingOrders.length > 0 ? (
              pendingOrders.map((order) => {
                const badge = getOrderBadge(order.orderStatus);
                return (
                  <PendingCard
                    key={order._id}
                    href={`/dashboard/orders/${order._id}`}
                    title={`Order #${order._id.slice(-8).toUpperCase()}`}
                    subtitle={order.user?.name || order.user?.email || "Customer order"}
                    badgeLabel={badge.label}
                    badgeClassName={badge.className}
                    metaLeft={formatDateTime(order.createdAt)}
                    metaRight={formatMoney(Number(order.totalPrice || 0))}
                  />
                );
              })
            ) : (
              <p className="py-4 text-xs text-text-secondary">No orders need action right now.</p>
            )}
          </QueuePanel>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-3">
          <QueuePanel
            title="Products to Review"
            description="New or updated products waiting for approval."
            count={pendingProducts.length}
          >
            {pendingProducts.length > 0 ? (
              pendingProducts.map((product) => {
                const badge = getApprovalBadge(product.approvalStatus || "pending");
                return (
                  <PendingCard
                    key={product._id}
                    href={`/dashboard/products/${product._id}`}
                    title={product.name}
                    subtitle={`${product.brand}${product.reference ? ` · ${product.reference}` : ""}`}
                    badgeLabel={badge.label}
                    badgeClassName={badge.className}
                    metaLeft={formatDateTime(product.createdAt)}
                    metaRight={product.createdBy?.name || "Store owner"}
                  />
                );
              })
            ) : (
              <p className="py-4 text-xs text-text-secondary">No product reviews are waiting.</p>
            )}
          </QueuePanel>

          <QueuePanel
            title="Store Requests"
            description="Store applications waiting for a decision."
            count={pendingStores.length}
          >
            {pendingStores.length > 0 ? (
              pendingStores.map((store) => (
                <PendingCard
                  key={store._id}
                  href={`/dashboard/stores?storeId=${encodeURIComponent(store._id)}`}
                  title={store.storeName || store.name}
                  subtitle={`${store.name} · ${getStoreTypeLabel(store.storeType)}`}
                  badgeLabel="Pending"
                  badgeClassName="bg-warning/10 text-warning"
                  metaLeft={formatDateTime(store.createdAt)}
                  metaRight={store.category}
                />
              ))
            ) : (
              <p className="py-4 text-xs text-text-secondary">No store applications are pending.</p>
            )}
          </QueuePanel>

          <QueuePanel
            title="Orders Needing Action"
            description="Orders in processing or confirmation."
            count={pendingOrders.length}
          >
            {pendingOrders.length > 0 ? (
              pendingOrders.map((order) => {
                const badge = getOrderBadge(order.orderStatus);
                return (
                  <PendingCard
                    key={order._id}
                    href={`/dashboard/orders/${order._id}`}
                    title={`Order #${order._id.slice(-8).toUpperCase()}`}
                    subtitle={order.user?.name || order.user?.email || "Customer order"}
                    badgeLabel={badge.label}
                    badgeClassName={badge.className}
                    metaLeft={formatDateTime(order.createdAt)}
                    metaRight={formatMoney(Number(order.totalPrice || 0))}
                  />
                );
              })
            ) : (
              <p className="py-4 text-xs text-text-secondary">No orders are waiting for review.</p>
            )}
          </QueuePanel>
        </div>
      )}
    </div>
  );
}
