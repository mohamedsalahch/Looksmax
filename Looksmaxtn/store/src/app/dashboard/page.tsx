"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import StoreDashboardShell from "@/components/StoreDashboardShell";
import { withAuthRequest } from "@/lib/authClient";

interface RecentOrder {
  _id: string;
  orderStatus: string;
  totalPrice?: number;
  createdAt: string;
  items?: { name: string; quantity: number }[];
}

interface StoreStats {
  totalProducts: number;
  activeProducts: number;
  totalOrders: number;
  pendingOrders: number;
  fulfilledOrders: number;
  totalRevenue: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  recentOrders: RecentOrder[];
}

function formatMoney(value?: number) {
  return `${Number(value || 0).toFixed(2)} TND`;
}

function formatDate(value?: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === "delivered") return "bg-[#f1ede8] text-[#6b6055]";
  if (status === "canceled" || status === "returned") return "bg-[#faf3f2] text-[#430C05]";
  if (status === "shipping") return "bg-neutral-200 text-neutral-700";
  return "bg-[#f6ead3] text-[#8a5b13]";
}

export default function StoreDashboardPage() {
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats", withAuthRequest())
      .then((response) => response.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cards = useMemo(() => {
    if (!stats) return [];

    return [
      { label: "Revenue", value: formatMoney(stats.totalRevenue), detail: "Total collected" },
      { label: "Orders", value: stats.totalOrders, detail: `${stats.fulfilledOrders} delivered` },
      { label: "Pending", value: stats.pendingOrders, detail: "Processing or confirmed" },
      { label: "Products", value: stats.totalProducts, detail: `${stats.activeProducts} active` },
      { label: "Low Stock", value: stats.lowStockProducts, detail: "3 items or fewer" },
      { label: "Out of Stock", value: stats.outOfStockProducts, detail: "Needs restock" },
    ];
  }, [stats]);

  return (
    <StoreDashboardShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.24em] text-text-secondary">Store</p>
          <h1 className="text-xl font-semibold tracking-wide text-foreground">Dashboard</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/products" className="border border-border-color px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-hover">
            Products
          </Link>
          <Link href="/orders" className="bg-foreground px-4 py-2 text-xs font-semibold uppercase tracking-wide text-background transition-colors hover:bg-accent">
            Orders
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading dashboard...</p>
      ) : !stats ? (
        <div className="border border-border-color border-dashed p-8 text-center">
          <p className="text-sm text-text-secondary">Dashboard data is unavailable.</p>
        </div>
      ) : (
        <div className="space-y-7">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {cards.map((card) => (
              <div key={card.label} className="border border-border-color bg-surface/35 p-5">
                <p className="text-2xl font-semibold text-foreground">{card.value}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-text-secondary">{card.label}</p>
                <p className="mt-1 text-[10px] text-text-secondary/80">{card.detail}</p>
              </div>
            ))}
          </div>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Recent Orders</h2>
              <Link href="/orders" className="text-xs font-medium text-foreground underline underline-offset-4 hover:text-accent">
                View all
              </Link>
            </div>

            {stats.recentOrders.length === 0 ? (
              <div className="border border-border-color border-dashed p-8 text-center">
                <p className="text-sm text-text-secondary">No orders yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border-color">
                <table className="min-w-[680px] w-full text-left">
                  <thead className="bg-surface/70">
                    <tr className="text-[10px] uppercase tracking-wider text-text-secondary">
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3">Items</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-color">
                    {stats.recentOrders.map((order) => (
                      <tr key={order._id} className="transition-colors hover:bg-hover/60">
                        <td className="px-4 py-3 text-xs font-medium">#{order._id.slice(-8).toUpperCase()}</td>
                        <td className="px-4 py-3 text-xs text-text-secondary">
                          {(order.items || []).slice(0, 2).map((item) => `${item.name} x${item.quantity}`).join(", ") || "No items"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${statusClass(order.orderStatus)}`}>
                            {order.orderStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium">{formatMoney(order.totalPrice)}</td>
                        <td className="px-4 py-3 text-xs text-text-secondary">{formatDate(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </StoreDashboardShell>
  );
}
