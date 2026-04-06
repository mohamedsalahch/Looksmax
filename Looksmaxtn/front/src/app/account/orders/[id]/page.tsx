"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { formatTndPrice } from "@/lib/formatPrice";
import { formatStoreDate } from "@/lib/dateFormat";

interface OrderDetail {
  _id: string;
  totalPrice: number;
  orderStatus: string;
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

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => r.json())
      .then((data) => setOrder(data.order))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

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

  if (loading) return <p className="text-xs text-text-secondary">Loading order...</p>;
  if (!order) return <p className="text-sm text-text-secondary">Order not found.</p>;

  const steps = ["processing", "confirmed", "shipping", "delivered"];
  const currentStep = steps.indexOf(order.orderStatus);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/account/orders" className="text-xs text-text-secondary hover:text-foreground transition-colors mb-2 inline-block">
            ← Back to Orders
          </Link>
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Order #{order._id.slice(-8).toUpperCase()}
          </h2>
          <p className="text-[10px] text-text-secondary mt-1">
            Placed on {formatStoreDate(order.createdAt, {
              year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${statusColor(order.orderStatus)}`}>
          {order.orderStatus}
        </span>
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
