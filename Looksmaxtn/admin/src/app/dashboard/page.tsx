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
      return { label: "Approved", className: "bg-[#f1ede8] text-[#6b6055]" };
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
      return { label: status || "Pending", className: "bg-[#f1ede8] text-[#6b6055]" };
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
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: string;
  tone: string;
}) {
  return (
    <div className="border border-border bg-bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className={`text-[10px] uppercase tracking-[0.18em] ${tone}`}>{label}</span>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-text-primary">{value}</p>
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
    <section className="border border-border bg-bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-primary">{title}</h2>
          <p className="mt-1 text-[11px] text-text-secondary">{description}</p>
        </div>
        <span className="inline-flex items-center rounded-none border border-border bg-bg-secondary px-2.5 py-1 text-[10px] uppercase tracking-wider text-text-secondary">
          {count}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
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
      className="block border border-border bg-bg-primary p-4 transition-colors hover:bg-bg-hover"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{title}</p>
          <p className="mt-1 text-[11px] text-text-secondary">{subtitle}</p>
        </div>
        <span className={`shrink-0 text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${badgeClassName}`}>
          {badgeLabel}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[10px] uppercase tracking-wider text-text-secondary">
        <span>{metaLeft}</span>
        {metaRight ? <span>{metaRight}</span> : null}
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

    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (loading || !stats) return <p className="text-xs text-text-secondary animate-pulse">Loading dashboard...</p>;

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
        { label: "Total Revenue", value: formatMoney(stats.totalRevenue), icon: "💰", tone: "text-[#6b6055]" },
        { label: "Products", value: stats.totalProducts, icon: "📦", tone: "text-accent" },
        { label: "Pending Products", value: pendingProducts.length, icon: "⏳", tone: "text-warning" },
        { label: "Orders", value: stats.totalOrders, icon: "🛒", tone: "text-info" },
        { label: "Pending Orders", value: pendingOrders.length, icon: "🔔", tone: "text-danger" },
        ...(credits
          ? [{ label: "Credits Remaining", value: credits.remaining, icon: "💳", tone: "text-accent" }]
          : []),
      ]
    : [
        { label: "Products", value: stats.totalProducts, icon: "📦", tone: "text-accent" },
        { label: "Pending Products", value: pendingProducts.length, icon: "⏳", tone: "text-warning" },
        { label: "Stores", value: stores.length, icon: "🏬", tone: "text-info" },
        { label: "Pending Stores", value: pendingStores.length, icon: "🧾", tone: "text-danger" },
        { label: "Orders", value: stats.totalOrders, icon: "🛒", tone: "text-info" },
        { label: "Pending Orders", value: pendingOrders.length, icon: "🔔", tone: "text-warning" },
      ];

  return (
    <div className="space-y-8">
      <section className="overflow-hidden border border-border bg-bg-card">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
          <div className="relative p-6 sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(215,192,140,0.22),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent_48%)]" />
            <div className="relative">
              <p className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">Dashboard</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                {isStoreDashboard && stats.storeName ? `${stats.storeName} Dashboard` : "Admin Dashboard"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
                {isStoreDashboard
                  ? "Track revenue, products, orders, and pending reviews for your store."
                  : "Focus on operations first: products needing review, pending store applications, and orders waiting on action."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center border border-border bg-bg-primary px-3 py-1 text-[10px] uppercase tracking-wider text-text-secondary">
                  {isStoreDashboard ? "Store view" : "Admin view"}
                </span>
                {isStoreDashboard ? (
                  <span className="inline-flex items-center border border-border bg-bg-primary px-3 py-1 text-[10px] uppercase tracking-wider text-text-secondary">
                    Revenue is included
                  </span>
                ) : (
                  <span className="inline-flex items-center border border-border bg-bg-primary px-3 py-1 text-[10px] uppercase tracking-wider text-text-secondary">
                    Revenue hidden
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 p-6 sm:p-8 lg:border-l lg:border-t-0">
            <p className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">
              {isStoreDashboard ? "Revenue snapshot" : "Review pulse"}
            </p>
            <div className="mt-4 space-y-4">
              <div className="flex items-end justify-between border-b border-border pb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-secondary">
                    {isStoreDashboard ? "Total Revenue" : "Pending Products"}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-text-primary">
                    {isStoreDashboard ? formatMoney(stats.totalRevenue) : pendingProducts.length}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                    {isStoreDashboard ? "Orders" : "Stores"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {isStoreDashboard ? stats.totalOrders : stores.length}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-border bg-bg-secondary p-4">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">Pending Orders</p>
                  <p className="mt-2 text-2xl font-semibold text-text-primary">{pendingOrders.length}</p>
                </div>
                <div className="border border-border bg-bg-secondary p-4">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">Pending Reviews</p>
                  <p className="mt-2 text-2xl font-semibold text-text-primary">
                    {isStoreDashboard ? pendingProducts.length : pendingProducts.length + pendingStores.length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <DashboardStatCard key={card.label} label={card.label} value={card.value} icon={card.icon} tone={card.tone} />
        ))}
      </section>

      {isStoreDashboard ? (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <QueuePanel
            title="Product Reviews"
            description="Products waiting for approval or visibility review."
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
                    subtitle={`${product.brand}${product.reference ? ` • ${product.reference}` : ""}`}
                    badgeLabel={badge.label}
                    badgeClassName={badge.className}
                    metaLeft={formatDateTime(product.createdAt)}
                    metaRight={product.visibilityStatus ? product.visibilityStatus : "pending"}
                  />
                );
              })
            ) : (
              <p className="text-sm text-text-secondary">No products waiting for review.</p>
            )}
          </QueuePanel>

          <QueuePanel
            title="Order Pipeline"
            description="Recent orders that are still moving through confirmation."
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
              <p className="text-sm text-text-secondary">No orders need action right now.</p>
            )}
          </QueuePanel>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
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
                    subtitle={`${product.brand}${product.reference ? ` • ${product.reference}` : ""}`}
                    badgeLabel={badge.label}
                    badgeClassName={badge.className}
                    metaLeft={formatDateTime(product.createdAt)}
                    metaRight={product.createdBy?.name || "Store owner"}
                  />
                );
              })
            ) : (
              <p className="text-sm text-text-secondary">No product reviews are waiting.</p>
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
                  subtitle={`${store.name} • ${getStoreTypeLabel(store.storeType)}`}
                  badgeLabel="Pending"
                  badgeClassName="bg-warning/10 text-warning"
                  metaLeft={formatDateTime(store.createdAt)}
                  metaRight={store.category}
                />
              ))
            ) : (
              <p className="text-sm text-text-secondary">No store applications are pending.</p>
            )}
          </QueuePanel>

          <QueuePanel
            title="Orders Needing Action"
            description="Orders currently in processing or confirmation."
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
              <p className="text-sm text-text-secondary">No orders are waiting for review.</p>
            )}
          </QueuePanel>
        </section>
      )}
    </div>
  );
}
