"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/providers/CartContext";
import { useAuth } from "@/providers/AuthContext";
import { getReservationKey } from "@/lib/reservations";
import { formatTndPrice } from "@/lib/formatPrice";
import { withAuthRequest } from "@/lib/authClient";
import { getCartItemProductId } from "@/lib/cartItem";

interface AppliedCoupon {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minimumOrderAmount: number;
  maxUses: number | null;
  usageCount: number;
  discountAmount: number;
  totalAfterDiscount: number;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, totalPrice, clearCart, removeItem, updateQuantity } = useCart();
  const { user, loading: authLoading } = useAuth();
  const shippingFee = 0;
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");
  const discountAmount = appliedCoupon?.discountAmount || 0;
  const grandTotal = Math.max(0, totalPrice + shippingFee - discountAmount);

  const [address, setAddress] = useState({
    fullName: user?.name || "",
    street: user?.address?.street || "",
    city: user?.address?.city || "",
    state: user?.address?.state || "",
    zip: user?.address?.zip || "",
    phone: user?.address?.phone || "",
  });
  const [guestEmail, setGuestEmail] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderPlaced, setOrderPlaced] = useState<string | null>(null);
  const [guestTrackingUrl, setGuestTrackingUrl] = useState<string | null>(null);
  const unavailableItems = items.filter((item) => item.isUnavailable);
  const hasUnavailableItems = unavailableItems.length > 0;

  const handleRemoveItem = async (itemId: string) => {
    removeItem(itemId);
  };

  const handleUpdateQuantity = (itemId: string, quantity: number) => {
    updateQuantity(itemId, quantity);
  };

  const validateCoupon = async (code: string) => {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setCouponError("Enter a coupon code.");
      setAppliedCoupon(null);
      return;
    }

    setCouponLoading(true);
    setCouponError("");

    try {
      const res = await fetch(
        "/api/coupons/validate",
        withAuthRequest({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: normalizedCode, subtotal: totalPrice }),
        })
      );
      const data = (await res.json()) as { coupon?: AppliedCoupon; error?: string };

      if (!res.ok || !data.coupon) {
        setAppliedCoupon(null);
        setCouponError(data.error || "Invalid coupon.");
        return;
      }

      setAppliedCoupon(data.coupon);
      setCouponCode(data.coupon.code);
    } catch {
      setAppliedCoupon(null);
      setCouponError("Failed to validate coupon. Please try again.");
    } finally {
      setCouponLoading(false);
    }
  };

  useEffect(() => {
    if (!appliedCoupon?.code) return;

    let active = true;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            "/api/coupons/validate",
            withAuthRequest({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: appliedCoupon.code, subtotal: totalPrice }),
            })
          );
          const data = (await res.json()) as { coupon?: AppliedCoupon; error?: string };

          if (!active) return;

          if (!res.ok || !data.coupon) {
            setAppliedCoupon(null);
            setCouponError(data.error || "Coupon is no longer valid.");
            return;
          }

          setAppliedCoupon(data.coupon);
          setCouponError("");
        } catch {
          if (!active) return;
          setAppliedCoupon(null);
          setCouponError("Coupon could not be refreshed.");
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [appliedCoupon?.code, totalPrice]);

  useEffect(() => {
    if (!orderPlaced || guestTrackingUrl) return;

    const timeout = window.setTimeout(() => {
      router.replace("/");
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [orderPlaced, router, guestTrackingUrl]);

  if (authLoading) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Loading...</p>
      </div>
    );
  }

  if (items.length === 0 && !orderPlaced) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-wide uppercase mb-3">Cart is Empty</h1>
          <p className="text-sm text-text-secondary mb-6">
            Add some items to your cart before checking out.
          </p>
          <Link
            href="/category/new-arrivals"
            className="bg-foreground text-background px-8 py-3 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors"
          >
            Browse Collection
          </Link>
        </div>
      </div>
    );
  }

  if (orderPlaced) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="inline-flex h-10 w-10 items-center justify-center border border-[#d8c9b8] bg-[#faf7f2] mb-6">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6b6055" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-wide uppercase mb-3">Order Placed!</h1>
          <p className="text-sm text-text-secondary mb-2">
            Your order has been placed successfully.
          </p>
          <p className="text-xs text-text-secondary mb-1">
            Payment Method: <span className="text-foreground font-medium">Cash on Delivery</span>
          </p>
          <p className="text-xs text-text-secondary mb-6">
            You will pay when you receive your order.
          </p>
          {guestTrackingUrl && (
            <p className="text-xs text-text-secondary mb-4">
              We emailed a tracking link to your inbox. You can also save this link to follow your order status.
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {guestTrackingUrl ? (
              <Link
                href={guestTrackingUrl}
                className="bg-foreground text-background px-6 py-3 text-xs font-medium tracking-wide uppercase hover:bg-accent transition-colors"
              >
                Track My Order
              </Link>
            ) : (
              <Link
                href={`/account/orders`}
                className="bg-foreground text-background px-6 py-3 text-xs font-medium tracking-wide uppercase hover:bg-accent transition-colors"
              >
                View My Orders
              </Link>
            )}
            <Link
              href="/"
              className="border border-foreground text-foreground px-6 py-3 text-xs font-medium tracking-wide uppercase hover:bg-hover transition-colors"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handlePlaceOrder = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (hasUnavailableItems) {
      setError("Some products in your cart are already taken. Remove them manually to continue.");
      return;
    }
    if (!user) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(guestEmail.trim())) {
        setError("Please enter a valid email address so we can send your order tracking link.");
        return;
      }
    }
    setSubmitLoading(true);

    try {
      const orderItems = items.map((item) => ({
        productId: getCartItemProductId(item.id),
        name: item.name,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
      }));

      const payload = {
        items: orderItems,
        shippingAddress: address,
        cartKey: getReservationKey(),
        couponCode: appliedCoupon?.code || couponCode.trim() || "",
        ...(user ? {} : { guestEmail: guestEmail.trim() }),
      };

      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      };

      const res = await fetch("/api/orders", user ? withAuthRequest(init) : init);

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to place order");
        setSubmitLoading(false);
        return;
      }

      clearCart();
      setCouponCode("");
      setAppliedCoupon(null);
      setCouponError("");
      setGuestTrackingUrl(typeof data.trackingUrl === "string" ? data.trackingUrl : null);
      setOrderPlaced(data.order._id);
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitLoading(false);
  };

  return (
    <div className="pt-[72px] min-h-screen">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        <h1 className="text-lg font-semibold tracking-wide uppercase mb-8">Checkout</h1>

        <form onSubmit={handlePlaceOrder}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Left — Shipping */}
            <div>
              <h2 className="text-[10px] uppercase tracking-[0.28em] text-text-secondary mb-6">
                Shipping Address
              </h2>

              {error && (
                <div className="border border-[#430C05] bg-[#faf3f2] px-4 py-3 mb-4 text-xs text-[#430C05]">
                  {error}
                </div>
              )}

              {!user && (
                <div className="mb-4 border border-border-color bg-surface/40 px-4 py-3 text-xs text-text-secondary">
                  Checking out as guest.{" "}
                  <Link
                    href={`/login?next=${encodeURIComponent("/checkout")}`}
                    className="text-foreground underline underline-offset-2 hover:text-accent"
                  >
                    Sign in
                  </Link>{" "}
                  to save your order to your account.
                </div>
              )}

              <div className="space-y-4">
                {!user && (
                  <div>
                    <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-text-secondary/70"
                    />
                    <p className="mt-1 text-[10px] text-text-secondary">
                      We will email you a link to track your order status.
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={address.fullName}
                    onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                    className="w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-text-secondary/70"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Street Address
                  </label>
                  <input
                    type="text"
                    required
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value })}
                    className="w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-text-secondary/70"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                      City
                    </label>
                    <input
                      type="text"
                      required
                      value={address.city}
                      onChange={(e) => setAddress({ ...address, city: e.target.value })}
                      className="w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-text-secondary/70"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                      State
                    </label>
                    <input
                      type="text"
                      required
                      value={address.state}
                      onChange={(e) => setAddress({ ...address, state: e.target.value })}
                      className="w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-text-secondary/70"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                      ZIP Code
                    </label>
                    <input
                      type="text"
                      required
                      value={address.zip}
                      onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                      className="w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-text-secondary/70"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                      Phone
                    </label>
                    <input
                      type="tel"
                      required
                      value={address.phone}
                      onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                      className="w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-text-secondary/70"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="mt-8">
                <h2 className="text-xs font-semibold uppercase tracking-wider mb-4 text-text-secondary">
                  Payment Method
                </h2>
                <div className="border border-foreground bg-surface/50 px-4 py-4 flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-foreground flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Cash on Delivery</p>
                    <p className="text-[10px] text-text-secondary">
                      Pay when you receive your order
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right — Order Summary */}
            <div>
              <h2 className="text-[10px] uppercase tracking-[0.28em] text-text-secondary mb-6">
                Order Summary
              </h2>
              <div className="divide-y divide-border-color/40">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex gap-3 p-4 ${
                      item.isUnavailable ? "bg-[#faf3f2]/80" : ""
                    }`}
                  >
                    <div
                      className={`w-32 h-44 shrink-0 overflow-hidden ${
                        item.isUnavailable ? "bg-[#f6ddd7]" : "bg-surface"
                      }`}
                    >
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-full h-full placeholder-img">
                          <span className="text-[6px] tracking-wider opacity-50">IMG</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{item.name}</p>
                          <p className="text-[10px] text-text-secondary mt-0.5">
                            {item.productType === "perfume"
                              ? `Fragrance · Qty: ${item.quantity}`
                              : `${item.size || ""}${item.size && item.color ? " · " : ""}${item.color || ""} · Qty: ${item.quantity}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="shrink-0 text-xs uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-foreground hover:decoration-foreground"
                        >
                          Remove
                        </button>
                      </div>
                      {item.isUnavailable && (
                        <p className="text-[10px] text-[#430C05] mt-1">
                          {item.unavailableReason || "This product is already taken."}
                        </p>
                      )}
                      <p className="text-xs font-medium mt-1">
                        {formatTndPrice(parseFloat(item.price) * item.quantity)}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (item.quantity === 1) {
                              void handleRemoveItem(item.id);
                              return;
                            }
                            handleUpdateQuantity(item.id, item.quantity - 1);
                          }}
                          className="text-sm leading-none text-text-secondary hover:text-foreground transition-colors"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="min-w-[1.5rem] border-b border-border-color py-1 text-center text-xs font-medium tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                          className="text-sm leading-none text-text-secondary hover:text-foreground transition-colors"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {hasUnavailableItems && (
                  <div className="border border-[#430C05] bg-[#faf3f2] p-4">
                    <p className="text-xs text-[#430C05] font-medium">
                      Some items are already taken. Remove them from the cart to place your order.
                    </p>
                  </div>
                )}

                <div className="p-4 space-y-2">
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Subtotal</span>
                    <span>{formatTndPrice(totalPrice)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-xs text-text-secondary">
                      <span>Coupon</span>
                      <span>- {formatTndPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Shipping</span>
                    <span>Free</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold pt-2 border-t border-border-color">
                    <span>Total</span>
                    <span>{formatTndPrice(grandTotal)}</span>
                  </div>
                </div>
                <div className="p-4">
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">
                    Coupon Code
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Enter coupon code"
                      className="flex-1 border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm focus:outline-none focus:border-foreground transition-colors uppercase placeholder:text-text-secondary/70"
                    />
                    <button
                      type="button"
                      onClick={() => void validateCoupon(couponCode)}
                      disabled={couponLoading}
                      className="self-end pb-2 inline-flex items-center text-xs uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-foreground hover:decoration-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {couponLoading ? "Checking..." : appliedCoupon ? "Recheck" : "Apply"}
                    </button>
                  </div>
                  {couponError && <p className="mt-2 text-xs text-[#430C05]">{couponError}</p>}
                  {appliedCoupon && !couponError && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6b6055]">
                      <span className="uppercase tracking-wider">
                        Applied {appliedCoupon.code}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedCoupon(null);
                          setCouponCode("");
                          setCouponError("");
                        }}
                        className="uppercase tracking-wider text-foreground hover:text-accent transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitLoading || hasUnavailableItems}
                className="w-full mt-6 bg-foreground text-background py-4 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitLoading
                  ? "Placing Order..."
                  : hasUnavailableItems
                    ? "Remove Taken Items"
                    : `Place Order — ${formatTndPrice(grandTotal)}`}
              </button>

              <p className="text-[10px] text-text-secondary text-center mt-3">
                By placing this order you agree to our{" "}
                <Link
                  href="/terms-and-conditions"
                  className="text-foreground underline underline-offset-2 hover:text-accent transition-colors"
                >
                  Terms & Conditions
                </Link>
                .
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
