"use client";

import { useDeferredValue, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { withAuthRequest } from "@/lib/authClient";

interface Order {
  _id: string; totalPrice: number; orderStatus: string;
  isArchived?: boolean;
  createdAt: string; user?: { name: string; email: string };
  items: { product?: string; name: string; quantity: number; storeNameSnapshot?: string }[];
  storeIds?: Array<{ name?: string; slug?: string }>;
}

type AdminOrderRealtimeEvent =
  | { type: "order:upsert"; order: Order }
  | { type: "order:delete"; orderId: string };

type SortKey = "order" | "customer" | "items" | "total" | "status" | "archive" | "date";
type SortDirection = "asc" | "desc";

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingOrderId, setDeletingOrderId] = useState("");
  const [filter, setFilter] = useState("all");
  const [archiveFilter, setArchiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    fetch("/api/orders", withAuthRequest()).then((r) => r.json()).then((d) => setOrders(d.orders || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleOrderEvent = (event: Event) => {
      const detail = (event as CustomEvent<AdminOrderRealtimeEvent>).detail;
      if (!detail) return;

      if (detail.type === "order:delete") {
        setOrders((current) => current.filter((order) => order._id !== detail.orderId));
        return;
      }

      if (detail.type === "order:upsert") {
        setOrders((current) => {
          const exists = current.some((order) => order._id === detail.order._id);
          if (!exists) return [detail.order, ...current];
          return current.map((order) => (order._id === detail.order._id ? detail.order : order));
        });
      }
    };

    window.addEventListener("looksmax-admin-order-event", handleOrderEvent);
    return () => window.removeEventListener("looksmax-admin-order-event", handleOrderEvent);
  }, []);

  const filtered = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    return orders.filter((o) => {
      const matchesStatus = filter === "all" ? true : o.orderStatus === filter;
      const isArchived = Boolean(o.isArchived);
      const matchesArchive =
        archiveFilter === "all" ||
        (archiveFilter === "active" && !isArchived) ||
        (archiveFilter === "archived" && isArchived);
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          o._id,
          o.user?.name || "",
          o.user?.email || "",
          ...(o.storeIds || []).map((store) => store.name || store.slug || ""),
          ...o.items.map((item) => item.storeNameSnapshot || ""),
          ...o.items.map((item) => item.name),
          ...o.items.map((item) => item.product || ""),
        ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));

      return matchesStatus && matchesArchive && matchesSearch;
    });
  }, [archiveFilter, deferredSearch, filter, orders]);

  const sorted = useMemo(() => {
    const items = [...filtered];

    const getSortableValue = (order: Order) => {
      switch (sortKey) {
        case "order":
          return order._id;
        case "customer":
          return order.user?.name || order.user?.email || "";
        case "items":
          return order.items.length;
        case "total":
          return order.totalPrice;
        case "status":
          return order.orderStatus;
        case "archive":
          return order.isArchived ? "archived" : "active";
        default:
          return order.createdAt;
      }
    };

    items.sort((a, b) => {
      const left = getSortableValue(a);
      const right = getSortableValue(b);

      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return items;
  }, [filtered, sortDirection, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-[9px] text-text-secondary/60">↕</span>;
    return <span className="text-[9px] text-accent">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  const handleDeleteOrder = async (orderId: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!confirm("Delete this order? This cannot be undone.")) return;

    setDeletingOrderId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, withAuthRequest({ method: "DELETE" }));
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to delete order");
      } else {
        setOrders((current) => current.filter((order) => order._id !== orderId));
      }
    } catch {
      alert("Failed to delete order");
    }
    setDeletingOrderId("");
  };

  const normalizedSearch = deferredSearch.trim();

  const statusColor = (s: string) => {
    switch (s) {
      case "processing": return "text-amber-300 bg-amber-500/10";
      case "confirmed": return "text-sky-300 bg-sky-500/10";
      case "shipping": return "text-violet-300 bg-violet-500/10";
      case "delivered": return "text-[#6b6055] bg-[#f1ede8]";
      case "returned": return "text-orange-300 bg-orange-500/10";
      case "canceled": return "text-rose-300 bg-rose-500/10";
      default: return "text-text-secondary bg-bg-secondary";
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-wide">Orders</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {["all", "processing", "confirmed", "canceled", "shipping", "delivered", "returned"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-[10px] px-3 py-1.5 uppercase tracking-wider font-medium transition-colors cursor-pointer ${
              filter === f ? "bg-accent text-bg-primary" : "bg-bg-secondary text-text-secondary border border-border hover:text-text-primary"
            }`}>
            {f} {f !== "all" && `(${orders.filter((o) => o.orderStatus === f).length})`}
          </button>
        ))}
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order, customer, email, product, or product ID..."
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        />
        <select
          value={archiveFilter}
          onChange={(e) => setArchiveFilter(e.target.value)}
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        >
          <option value="all">All archive states</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : sorted.length === 0 ? (
        <div className="border border-border border-dashed p-8 text-center rounded">
          <p className="text-sm text-text-secondary">
            {normalizedSearch || filter !== "all" || archiveFilter !== "all"
              ? "No orders match your search and filters"
              : "No orders found"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded">
          <table className="min-w-[860px] w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("order")} className="inline-flex items-center gap-1 cursor-pointer">
                    Order {renderSortIndicator("order")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("customer")} className="inline-flex items-center gap-1 cursor-pointer">
                    Customer {renderSortIndicator("customer")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("items")} className="inline-flex items-center gap-1 cursor-pointer">
                    Items {renderSortIndicator("items")}
                  </button>
                </th>
                <th className="px-4 py-3">Stores</th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("total")} className="inline-flex items-center gap-1 cursor-pointer">
                    Total {renderSortIndicator("total")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("status")} className="inline-flex items-center gap-1 cursor-pointer">
                    Status {renderSortIndicator("status")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("archive")} className="inline-flex items-center gap-1 cursor-pointer">
                    Archive {renderSortIndicator("archive")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("date")} className="inline-flex items-center gap-1 cursor-pointer">
                    Date {renderSortIndicator("date")}
                  </button>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((o) => (
                <tr
                  key={o._id}
                  onClick={() => router.push(`/dashboard/orders/${o._id}`)}
                  className="cursor-pointer hover:bg-bg-hover transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/orders/${o._id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-mono text-accent hover:text-accent-hover transition-colors"
                    >
                      #{o._id.slice(-8).toUpperCase()}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium">{o.user?.name || "Unknown"}</p>
                    <p className="text-[10px] text-text-secondary">{o.user?.email || ""}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{o.items.length} items</td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {[
                      ...(o.storeIds || []).map((store) => store.name || store.slug || ""),
                      ...o.items.map((item) => item.storeNameSnapshot || ""),
                    ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(", ") || "Looksmaxtn"}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">${o.totalPrice.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${statusColor(o.orderStatus)}`}>
                      {o.orderStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${
                        o.isArchived ? "text-neutral-700 bg-neutral-200" : "text-[#6b6055] bg-[#f1ede8]"
                      }`}
                    >
                      {o.isArchived ? "Archived" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(event) => handleDeleteOrder(o._id, event)}
                      disabled={deletingOrderId === o._id}
                      className="text-[10px] uppercase tracking-wider text-rose-300 hover:text-rose-200 transition-colors disabled:opacity-50"
                    >
                      {deletingOrderId === o._id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
