"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Order {
  _id: string; totalPrice: number; orderStatus: string;
  createdAt: string; user?: { name: string; email: string };
  items: { product?: string; name: string; quantity: number }[];
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/orders").then((r) => r.json()).then((d) => setOrders(d.orders || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = orders.filter((o) => {
    const matchesStatus = filter === "all" ? true : o.orderStatus === filter;
    const matchesSearch = normalizedSearch
      ? [
          o._id,
          o.user?.name || "",
          o.user?.email || "",
          ...o.items.map((item) => item.name),
          ...o.items.map((item) => item.product || ""),
        ].some((value) => value.toLowerCase().includes(normalizedSearch))
      : true;
    return matchesStatus && matchesSearch;
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "processing": return "text-amber-300 bg-amber-500/10";
      case "confirmed": return "text-sky-300 bg-sky-500/10";
      case "shipping": return "text-violet-300 bg-violet-500/10";
      case "delivered": return "text-emerald-300 bg-emerald-500/10";
      case "returned": return "text-orange-300 bg-orange-500/10";
      case "canceled": return "text-rose-300 bg-rose-500/10";
      default: return "text-text-secondary bg-bg-secondary";
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-wide mb-6">Orders</h1>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {["all", "processing", "confirmed", "canceled", "shipping", "delivered", "returned"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-[10px] px-3 py-1.5 uppercase tracking-wider font-medium transition-colors cursor-pointer ${
              filter === f ? "bg-accent text-bg-primary" : "bg-bg-secondary text-text-secondary border border-border hover:text-text-primary"
            }`}>
            {f} {f !== "all" && `(${orders.filter((o) => o.orderStatus === f).length})`}
          </button>
        ))}
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search orders by order ID, product ID, customer, email, or product..."
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        />
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="border border-border border-dashed p-8 text-center rounded">
          <p className="text-sm text-text-secondary">No orders found</p>
        </div>
      ) : (
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((o) => (
                <tr key={o._id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/orders/${o._id}`} className="text-xs font-mono text-accent hover:text-accent-hover transition-colors">
                      #{o._id.slice(-8).toUpperCase()}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium">{o.user?.name || "Unknown"}</p>
                    <p className="text-[10px] text-text-secondary">{o.user?.email || ""}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{o.items.length} items</td>
                  <td className="px-4 py-3 text-xs font-medium">${o.totalPrice.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${statusColor(o.orderStatus)}`}>
                      {o.orderStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
