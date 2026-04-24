"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatTndPrice } from "@/lib/formatPrice";
import { formatStoreDate } from "@/lib/dateFormat";

interface TrackedOrder {
  _id: string;
  orderStatus: string;
  paymentMethod: string;
  createdAt: string;
  subtotalPrice: number;
  shippingFee: number;
  couponCode?: string;
  couponDiscountAmount?: number;
  totalPrice: number;
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

export default function TrackOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("This tracking link is missing its access token.");
      setLoading(false);
      return;
    }

    fetch(`/api/orders/${id}/track?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || "Order not found.");
          return;
        }
        setOrder(data.order);
      })
      .catch(() => setError("Could not load order."))
      .finally(() => setLoading(false));
  }, [id, token]);

  if (loading) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Loading order...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <h1 className="text-lg font-semibold tracking-wide uppercase mb-3">Order Not Found</h1>
          <p className="text-sm text-text-secondary mb-6">
            {error || "We could not find this order."}
          </p>
          <Link
            href="/"
            className="bg-foreground text-background px-8 py-3 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const orderNumber = order._id.slice(-8).toUpperCase();

  return (
    <div className="pt-[72px] min-h-screen">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <h1 className="text-lg font-semibold tracking-wide uppercase">
            Order {orderNumber}
          </h1>
          <span
            className={`text-[10px] px-2 py-1 uppercase tracking-wider ${statusColor(order.orderStatus)}`}
          >
            {order.orderStatus}
          </span>
        </div>

        <p className="text-xs text-text-secondary mb-8">
          Placed on {formatStoreDate(order.createdAt)} · Payment: {order.paymentMethod === "cod" ? "Cash on Delivery" : order.paymentMethod}
        </p>

        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-4 text-text-secondary">
            Items
          </h2>
          <div className="border border-border-color divide-y divide-border-color">
            {order.items.map((item, i) => (
              <div key={i} className="p-4 flex justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-[10px] text-text-secondary mt-0.5">
                    {item.size || ""}{item.size && item.color ? " · " : ""}{item.color || ""} · Qty: {item.quantity}
                  </p>
                </div>
                <p className="text-sm font-medium whitespace-nowrap">
                  {formatTndPrice(item.price * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-4 text-text-secondary">
            Shipping Address
          </h2>
          <div className="border border-border-color p-4 text-sm space-y-1">
            <p className="font-medium">{order.shippingAddress.fullName}</p>
            <p className="text-text-secondary">{order.shippingAddress.street}</p>
            <p className="text-text-secondary">
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
            </p>
            <p className="text-text-secondary">{order.shippingAddress.phone}</p>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-4 text-text-secondary">
            Summary
          </h2>
          <div className="border border-border-color p-4 space-y-2 text-xs">
            <div className="flex justify-between text-text-secondary">
              <span>Subtotal</span>
              <span>{formatTndPrice(order.subtotalPrice)}</span>
            </div>
            {order.couponDiscountAmount ? (
              <div className="flex justify-between text-text-secondary">
                <span>Coupon {order.couponCode}</span>
                <span>- {formatTndPrice(order.couponDiscountAmount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-text-secondary">
              <span>Shipping</span>
              <span>{order.shippingFee ? formatTndPrice(order.shippingFee) : "Free"}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold pt-2 border-t border-border-color">
              <span>Total</span>
              <span>{formatTndPrice(order.totalPrice)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
