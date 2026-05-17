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

function formatOrderSizeLabel(size?: string) {
  return size?.trim() || "";
}

function OrderColorSwatch({ color }: { color: string }) {
  if (!color) return null;
  return (
    <span
      className="inline-block h-3 w-3 shrink-0 rounded-[2px] border border-border-color/40 align-middle"
      style={{ backgroundColor: color }}
      aria-hidden="true"
      title={color}
    />
  );
}

function OrderVariantMeta({ size, color, quantity }: { size?: string; color?: string; quantity: number }) {
  const normalizedSize = formatOrderSizeLabel(size);
  const normalizedColor = color?.trim() || "";
  const hasVariantMeta = Boolean(normalizedSize || normalizedColor);

  return (
    <span className="inline-flex items-center gap-1">
      {normalizedSize ? <span>{normalizedSize}</span> : null}
      {normalizedSize && normalizedColor ? <span className="opacity-60">|</span> : null}
      {normalizedColor ? <OrderColorSwatch color={normalizedColor} /> : null}
      {hasVariantMeta ? <span className="opacity-60">|</span> : null}
      <span>Qty: {quantity}</span>
    </span>
  );
}

const PIPELINE_STEPS = [
  { key: "processing", label: "Processing" },
  { key: "confirmed", label: "Confirmed" },
  { key: "shipping", label: "Shipping" },
  { key: "delivered", label: "Delivered" },
] as const;

function OrderPipeline({ status }: { status: string }) {
  if (status === "canceled" || status === "returned") {
    return (
      <div className="mb-8 border border-red-200 bg-red-50 px-4 py-3 text-xs uppercase tracking-wider text-red-700">
        Order {status}
      </div>
    );
  }

  const currentIndex = PIPELINE_STEPS.findIndex((step) => step.key === status);
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;
  const progressPct = PIPELINE_STEPS.length > 1
    ? (safeIndex / (PIPELINE_STEPS.length - 1)) * 100
    : 0;

  return (
    <div className="mb-10">
      <div className="relative flex items-start justify-between px-1">
        <div className="absolute left-[14px] right-[14px] top-[13px] h-[3px] rounded-full bg-foreground/10" />
        <div
          className="absolute left-[14px] top-[13px] h-[3px] rounded-full bg-foreground transition-[width] duration-700 ease-out"
          style={{
            width: `calc((100% - 28px) * ${progressPct / 100})`,
          }}
        />
        {PIPELINE_STEPS.map((step, i) => {
          const done = i < safeIndex;
          const current = i === safeIndex;
          return (
            <div key={step.key} className="relative z-10 flex flex-col items-center gap-2.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-500 ${
                  done
                    ? "bg-foreground"
                    : current
                    ? "bg-background ring-[3px] ring-foreground shadow-[0_0_0_4px_rgba(0,0,0,0.04)]"
                    : "bg-foreground/10"
                }`}
              >
                {done && (
                  <svg
                    viewBox="0 0 12 12"
                    className="h-3 w-3 text-background"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="2.5,6.5 5,9 9.5,3.5" />
                  </svg>
                )}
                {current && <div className="h-2 w-2 rounded-full bg-foreground" />}
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider ${
                  current ? "text-foreground font-semibold" : "text-text-secondary"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      <div className="pt-[80px] min-h-screen flex items-center justify-center">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Loading order...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="pt-[80px] min-h-screen flex items-center justify-center">
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
    <div className="pt-[80px] min-h-screen">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <h1 className="text-lg font-semibold tracking-wide uppercase">
            Order {orderNumber}
          </h1>
        </div>

        <p className="text-xs text-text-secondary mb-8">
          Placed on {formatStoreDate(order.createdAt)} · Payment: {order.paymentMethod === "cod" ? "Cash on Delivery" : order.paymentMethod}
        </p>

        <OrderPipeline status={order.orderStatus} />

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
                    <OrderVariantMeta size={item.size} color={item.color} quantity={item.quantity} />
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
