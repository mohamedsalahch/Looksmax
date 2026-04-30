"use client";

import { useEffect, useMemo, useState } from "react";
import StoreDashboardShell from "@/components/StoreDashboardShell";
import { withAuthRequest } from "@/lib/authClient";

interface StoreOrder {
  _id: string;
  orderStatus: string;
  createdAt: string;
  totalPrice?: number;
  guestEmail?: string;
  user?: { name?: string; email?: string };
  shippingAddress?: { fullName?: string; city?: string; phone?: string };
  items?: { name: string; quantity: number; size?: string; price?: number }[];
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

export default function StoreOrdersPage() {
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders", withAuthRequest())
      .then((response) => response.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredOrders = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((order) => order.orderStatus === statusFilter);
  }, [orders, statusFilter]);

  return (
    <StoreDashboardShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.24em] text-text-secondary">Store</p>
          <h1 className="text-xl font-semibold tracking-wide text-foreground">Orders</h1>
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="w-full border border-border-color bg-surface/40 px-4 py-2.5 text-sm text-foreground transition-colors focus:border-foreground sm:w-48"
        >
          <option value="all">All statuses</option>
          <option value="processing">Processing</option>
          <option value="confirmed">Confirmed</option>
          <option value="shipping">Shipping</option>
          <option value="delivered">Delivered</option>
          <option value="returned">Returned</option>
          <option value="canceled">Canceled</option>
        </select>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading orders...</p>
      ) : filteredOrders.length === 0 ? (
        <div className="border border-border-color border-dashed p-8 text-center">
          <p className="text-sm text-text-secondary">No orders found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border-color">
          <table className="min-w-[900px] w-full text-left">
            <thead className="bg-surface/70">
              <tr className="text-[10px] uppercase tracking-wider text-text-secondary">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color">
              {filteredOrders.map((order) => (
                <tr key={order._id} className="transition-colors hover:bg-hover/60">
                  <td className="px-4 py-3 text-xs font-medium">#{order._id.slice(-8).toUpperCase()}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium">{order.shippingAddress?.fullName || order.user?.name || "Customer"}</p>
                    <p className="text-[10px] text-text-secondary">{order.user?.email || order.guestEmail || order.shippingAddress?.phone || "No contact"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {(order.items || []).slice(0, 3).map((item) => `${item.name} x${item.quantity}`).join(", ") || "No items"}
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
    </StoreDashboardShell>
  );
}
