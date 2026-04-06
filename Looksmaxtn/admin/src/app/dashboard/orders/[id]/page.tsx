"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

interface OrderDetail {
  _id: string; totalPrice: number; orderStatus: string;
  paymentMethod: string; createdAt: string;
  user?: { name: string; email: string; };
  shippingAddress: { fullName: string; street: string; city: string; state: string; zip: string; phone: string; };
  items: { productId: string; name: string; price: number; size: string; color: string; quantity: number; }[];
}

const ORDER_TRANSITIONS: Record<string, string[]> = {
  processing: ["confirmed", "canceled"],
  confirmed: ["shipping"],
  shipping: ["delivered", "returned"],
  delivered: [],
  canceled: [],
  returned: [],
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetch(`/api/orders/${id}`).then((r) => r.json()).then((d) => setOrder(d.order)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const updateStatus = async (orderStatus: string) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || "Failed to update order status");
      } else if (d.order) {
        setOrder(d.order);
      }
    } catch {}
    setUpdating(false);
  };

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

  if (loading) return <p className="text-xs text-text-secondary animate-pulse">Loading...</p>;
  if (!order) return <p className="text-sm text-text-secondary">Order not found.</p>;
  const isLocked = ["delivered", "canceled", "returned"].includes(order.orderStatus);
  const nextStatuses = ORDER_TRANSITIONS[order.orderStatus] || [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard/orders" className="text-xs text-text-secondary hover:text-text-primary transition-colors mb-2 inline-block">← Back</Link>
          <h1 className="text-lg font-semibold">Order #{order._id.slice(-8).toUpperCase()}</h1>
          <p className="text-xs text-text-secondary">{new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <span className={`text-[10px] px-3 py-1 font-medium uppercase tracking-wider ${statusColor(order.orderStatus)}`}>{order.orderStatus}</span>
      </div>

      {/* Status Update */}
      <div className="bg-bg-card border border-border rounded p-4">
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">Update Status</p>
        {isLocked && (
          <p className="text-xs text-danger mb-3">This order is locked and can no longer be updated.</p>
        )}
        {!isLocked && (
          <p className="text-xs text-text-secondary mb-3">
            Allowed next step{nextStatuses.length > 1 ? "s" : ""}: {nextStatuses.join(" or ")}
          </p>
        )}
        {nextStatuses.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {nextStatuses.map((status) => (
              <button
                key={status}
                onClick={() => updateStatus(status)}
                disabled={updating}
                className="text-[10px] px-3 py-1.5 uppercase tracking-wider font-medium transition-colors cursor-pointer disabled:opacity-30 border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              >
                {status}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-secondary">No further status changes are allowed for this order.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer */}
        <div className="bg-bg-card border border-border rounded p-4">
          <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">Customer</p>
          <p className="text-sm font-medium">{order.user?.name || order.shippingAddress.fullName}</p>
          <p className="text-xs text-text-secondary">{order.user?.email}</p>
        </div>
        {/* Shipping */}
        <div className="bg-bg-card border border-border rounded p-4">
          <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">Shipping</p>
          <p className="text-xs">{order.shippingAddress.fullName}</p>
          <p className="text-xs text-text-secondary">{order.shippingAddress.street}</p>
          <p className="text-xs text-text-secondary">{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}</p>
          <p className="text-xs text-text-secondary">{order.shippingAddress.phone}</p>
        </div>
      </div>

      {/* Items */}
      <div className="bg-bg-card border border-border rounded overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-bg-secondary">
            <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
              <th className="px-4 py-3">Product</th><th className="px-4 py-3">Product ID</th><th className="px-4 py-3">Size</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3 text-right">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {order.items.map((item, i) => (
              <tr key={i}>
                <td className="px-4 py-3 text-xs">
                  <Link
                    href={`/dashboard/products/${item.productId}`}
                    className="font-medium text-accent hover:text-accent-hover transition-colors"
                  >
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-text-secondary">
                  <Link
                    href={`/dashboard/products/${item.productId}`}
                    className="hover:text-text-primary transition-colors"
                  >
                    {item.productId}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-text-secondary">{item.size}</td>
                <td className="px-4 py-3 text-xs">{item.quantity}</td>
                <td className="px-4 py-3 text-xs text-right font-medium">${(item.price * item.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border">
            <tr><td colSpan={4} className="px-4 py-3 text-xs font-semibold text-right">Total</td><td className="px-4 py-3 text-sm font-bold text-right text-accent">${order.totalPrice.toFixed(2)}</td></tr>
          </tfoot>
        </table>
      </div>

      {/* Payment */}
      <div className="bg-bg-card border border-border rounded p-4">
        <div>
          <p className="text-xs text-text-secondary uppercase">Payment Method</p>
          <p className="text-sm font-medium">Cash on Delivery</p>
        </div>
      </div>
    </div>
  );
}
