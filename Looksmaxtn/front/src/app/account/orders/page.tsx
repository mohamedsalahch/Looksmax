"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatTndPrice } from "@/lib/formatPrice";
import { formatStoreDate } from "@/lib/dateFormat";

interface Order {
  _id: string;
  totalPrice: number;
  orderStatus: string;
  isArchived?: boolean;
  paymentMethod: string;
  createdAt: string;
  items: { name: string; quantity: number; price: number }[];
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [archivingOrderId, setArchivingOrderId] = useState("");

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statusColor = (s: string) => {
    switch (s) {
      case "canceled": return "text-red-700 bg-red-100";
      case "returned": return "text-amber-700 bg-amber-100";
      case "delivered": return "text-green-700 bg-green-100";
      case "shipping": return "text-blue-700 bg-blue-100";
      case "confirmed": return "text-emerald-700 bg-emerald-100";
      default: return "text-yellow-700 bg-yellow-100";
    }
  };

  const handleArchive = async (orderId: string) => {
    setArchivingOrderId(orderId);
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true }),
      });
      if (response.ok) {
        setOrders((current) => current.filter((order) => order._id !== orderId));
      }
    } catch {
      // Keep current UI state on network failure.
    } finally {
      setArchivingOrderId("");
    }
  };

  if (loading) {
    return <p className="text-xs text-text-secondary">Loading orders...</p>;
  }

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider mb-6 text-text-secondary">
        Order History
      </h2>

      {orders.length === 0 ? (
        <div className="border border-border-color border-dashed p-8 text-center">
          <p className="text-sm text-text-secondary mb-4">You haven&apos;t placed any orders yet.</p>
          <Link
            href="/category/new-arrivals"
            className="bg-foreground text-background px-6 py-2.5 text-xs font-medium tracking-wide uppercase hover:bg-accent transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order._id}
              className="border border-border-color p-5 transition-colors hover:bg-hover"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Link
                    href={`/account/orders/${order._id}`}
                    className="text-[10px] text-text-secondary font-mono hover:text-foreground transition-colors"
                  >
                    Order #{order._id.slice(-8).toUpperCase()}
                  </Link>
                  <p className="text-[10px] text-text-secondary mt-0.5">
                    {formatStoreDate(order.createdAt, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${statusColor(order.orderStatus)}`}
                  >
                    {order.orderStatus}
                  </span>
                </div>
              </div>

              <div className="text-xs text-text-secondary mb-3">
                {order.items.map((item, i) => (
                  <span key={i}>
                    {item.name} × {item.quantity}
                    {i < order.items.length - 1 && " · "}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-border-color pt-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-text-secondary uppercase">
                    {order.paymentMethod === "cod" ? "Cash on Delivery" : order.paymentMethod}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold">{formatTndPrice(order.totalPrice)}</span>
                  <button
                    type="button"
                    onClick={() => void handleArchive(order._id)}
                    disabled={archivingOrderId === order._id}
                    className="text-[10px] uppercase tracking-[0.15em] text-text-secondary transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    {archivingOrderId === order._id ? "Archiving..." : "Archive"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
