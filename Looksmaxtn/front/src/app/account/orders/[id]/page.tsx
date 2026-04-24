"use client";

import { useEffect, useState, use } from "react";
import { formatTndPrice } from "@/lib/formatPrice";
import { formatStoreDate } from "@/lib/dateFormat";
import { withAuthRequest } from "@/lib/authClient";

interface OrderDetail {
  _id: string;
  totalPrice: number;
  orderStatus: string;
  isArchived?: boolean;
  paymentMethod: string;
  createdAt: string;
  shippingAddress: {
    fullName: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
  };
  items: {
    name: string;
    price: number;
    size: string;
    color: string;
    quantity: number;
  }[];
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    fetch(`/api/orders/${id}`, withAuthRequest())
      .then((r) => r.json())
      .then((data) => setOrder(data.order))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

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

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const response = await fetch(`/api/orders/${id}`, {
        ...withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archive: true }),
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setOrder(data.order);
      }
    } catch {
      // Keep current screen on failure.
    } finally {
      setArchiving(false);
    }
  };

  if (loading) return <p className="text-xs text-text-secondary">Loading order...</p>;
  if (!order) return <p className="text-sm text-text-secondary">Order not found.</p>;

  const steps = ["processing", "confirmed", "shipping", "delivered"];
  const currentStep = steps.indexOf(order.orderStatus);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Order #{order._id.slice(-8).toUpperCase()}
          </h2>
          <p className="text-[10px] text-text-secondary mt-1">
            Placed on {formatStoreDate(order.createdAt, {
              year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          {!order.isArchived ? (
            <button
              type="button"
              onClick={() => void handleArchive()}
              disabled={archiving}
              className="bg-foreground px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent disabled:opacity-50"
            >
              {archiving ? "Archiving..." : "Archive Order"}
            </button>
          ) : null}
          <div className="flex items-center gap-2">
            {order.isArchived ? (
              <span className="text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider text-neutral-700 bg-neutral-200">
                archived
              </span>
            ) : null}
            <span className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${statusColor(order.orderStatus)}`}>
              {order.orderStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Progress */}
      {!["canceled", "returned"].includes(order.orderStatus) && (
        <div className="flex items-center gap-0">
          {steps.map((step, i) => (
            <div key={step} className="flex items-center flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                i <= currentStep ? "bg-foreground text-background" : "bg-border-color text-text-secondary"
              }`}>
                {i <= currentStep ? "✓" : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 ${i < currentStep ? "bg-foreground" : "bg-border-color"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Items */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-4 text-text-secondary">Items</h3>
        <div className="border border-border-color divide-y divide-border-color">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="w-14 h-18 shrink-0 placeholder-img">
                <span className="text-[6px] tracking-wider opacity-50">IMG</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium">{item.name}</p>
                <p className="text-[10px] text-text-secondary mt-0.5">
                  {item.size && `Size: ${item.size}`}{item.color && ` · ${item.color}`} · Qty: {item.quantity}
                </p>
              </div>
              <p className="text-xs font-medium">{formatTndPrice(item.price * item.quantity)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Shipping */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 text-text-secondary">Shipping Address</h3>
          <div className="border border-border-color p-4 text-xs space-y-1">
            <p className="font-medium">{order.shippingAddress.fullName}</p>
            <p className="text-text-secondary">{order.shippingAddress.street}</p>
            <p className="text-text-secondary">
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
            </p>
            <p className="text-text-secondary">{order.shippingAddress.phone}</p>
          </div>
        </div>

        {/* Payment */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 text-text-secondary">Payment</h3>
          <div className="border border-border-color p-4 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-text-secondary">Method</span>
              <span className="font-medium">Cash on Delivery</span>
            </div>
            <div className="flex justify-between border-t border-border-color pt-2">
              <span className="font-semibold">Total</span>
              <span className="font-semibold">{formatTndPrice(order.totalPrice)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
