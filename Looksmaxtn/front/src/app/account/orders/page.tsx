"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatTndPrice } from "@/lib/formatPrice";
import { formatStoreDate } from "@/lib/dateFormat";
import { withAuthRequest } from "@/lib/authClient";

interface Order {
  _id: string;
  totalPrice: number;
  orderStatus: string;
  paymentMethod: string;
  createdAt: string;
  items: { name: string; quantity: number; price: number }[];
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/orders", withAuthRequest())
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statusColor = (s: string) => {
    switch (s) {
      case "canceled": return "text-red-700 bg-red-100";
      case "returned": return "text-amber-700 bg-amber-100";
      case "delivered": return "text-[#6b6055] bg-[#f1ede8]";
      case "shipping": return "text-blue-700 bg-blue-100";
      case "confirmed": return "text-[#5d6358] bg-[#ecebe5]";
      default: return "text-[#7d6e5f] bg-[#f6f2eb]";
    }
  };

  const openOrder = (orderId: string) => {
    router.push(`/account/orders/${orderId}`);
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
              role="link"
              tabIndex={0}
              onClick={() => openOrder(order._id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openOrder(order._id);
                }
              }}
              className="border border-border-color p-5 transition-colors hover:bg-hover cursor-pointer focus:outline-none focus:ring-1 focus:ring-foreground"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Link
                    href={`/account/orders/${order._id}`}
                    className="text-[10px] text-text-secondary font-mono hover:text-foreground transition-colors"
                    onClick={(event) => event.stopPropagation()}
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
                <span
                  className={`inline-block text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${statusColor(order.orderStatus)}`}
                >
                  {order.orderStatus}
                </span>
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
                <span className="text-sm font-semibold">{formatTndPrice(order.totalPrice)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
