"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/providers/CartContext";
import { useAuth } from "@/providers/AuthContext";
import { getReservationKey, releaseProductReservation } from "@/lib/reservations";
import { formatTndPrice } from "@/lib/formatPrice";
import { withAuthRequest } from "@/lib/authClient";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, totalPrice, clearCart, removeItem, updateQuantity } = useCart();
  const { user, loading: authLoading } = useAuth();
  const shippingFee = 0;
  const grandTotal = totalPrice + shippingFee;

  const [address, setAddress] = useState({
    fullName: user?.name || "",
    street: user?.address?.street || "",
    city: user?.address?.city || "",
    state: user?.address?.state || "",
    zip: user?.address?.zip || "",
    phone: user?.address?.phone || "",
  });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderPlaced, setOrderPlaced] = useState<string | null>(null);
  const unavailableItems = items.filter((item) => item.isUnavailable);
  const hasUnavailableItems = unavailableItems.length > 0;

  const handleRemoveItem = async (itemId: string) => {
    const productId = itemId.split("-")[0];
    await releaseProductReservation(productId).catch(() => {});
    removeItem(itemId);
  };

  const handleUpdateQuantity = (itemId: string, quantity: number) => {
    updateQuantity(itemId, quantity);
  };

  useEffect(() => {
    if (!orderPlaced) return;

    const timeout = window.setTimeout(() => {
      router.replace("/");
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [orderPlaced, router]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent("/checkout")}`);
    }
  }, [authLoading, router, user]);

  if (authLoading) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Redirecting to login...</p>
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
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={`/account/orders`}
              className="bg-foreground text-background px-6 py-3 text-xs font-medium tracking-wide uppercase hover:bg-accent transition-colors"
            >
              View My Orders
            </Link>
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

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (hasUnavailableItems) {
      setError("Some products in your cart are already taken. Remove them manually to continue.");
      return;
    }
    setSubmitLoading(true);

    try {
      const orderItems = items.map((item) => ({
        productId: item.id.split("-")[0],
        name: item.name,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
      }));

      const res = await fetch("/api/orders", {
        ...withAuthRequest({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: orderItems, shippingAddress: address, cartKey: getReservationKey() }),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to place order");
        setSubmitLoading(false);
        return;
      }

      await Promise.all(
        items.map((item) => releaseProductReservation(item.id.split("-")[0]).catch(() => {}))
      );
      clearCart();
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
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-6 text-text-secondary">
                Shipping Address
              </h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 mb-4 rounded">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={address.fullName}
                    onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                    className="w-full border border-border-color bg-transparent px-4 py-3 text-sm focus:border-foreground transition-colors"
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
                    className="w-full border border-border-color bg-transparent px-4 py-3 text-sm focus:border-foreground transition-colors"
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
                      className="w-full border border-border-color bg-transparent px-4 py-3 text-sm focus:border-foreground transition-colors"
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
                      className="w-full border border-border-color bg-transparent px-4 py-3 text-sm focus:border-foreground transition-colors"
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
                      className="w-full border border-border-color bg-transparent px-4 py-3 text-sm focus:border-foreground transition-colors"
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
                      className="w-full border border-border-color bg-transparent px-4 py-3 text-sm focus:border-foreground transition-colors"
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
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-6 text-text-secondary">
                Order Summary
              </h2>
              <div className="border border-border-color divide-y divide-border-color">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex gap-3 p-4 ${
                      item.isUnavailable ? "bg-red-50/80" : ""
                    }`}
                  >
                    <div
                      className={`w-14 h-20 shrink-0 overflow-hidden rounded-sm ${
                        item.isUnavailable ? "bg-red-100" : "bg-surface"
                      }`}
                    >
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full placeholder-img">
                          <span className="text-[6px] tracking-wider opacity-50">IMG</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.name}</p>
                      <p className="text-[10px] text-text-secondary mt-0.5">
                        {item.productType === "perfume"
                          ? `Fragrance · Qty: ${item.quantity}`
                          : `${item.size || ""}${item.size && item.color ? " · " : ""}${item.color || ""} · Qty: ${item.quantity}`}
                      </p>
                      {item.isUnavailable && (
                        <p className="text-[10px] text-danger mt-1">
                          {item.unavailableReason || "This product is already taken."}
                        </p>
                      )}
                      <p className="text-xs font-medium mt-1">
                        {formatTndPrice(parseFloat(item.price) * item.quantity)}
                      </p>
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <div className="flex items-center border border-border-color">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.quantity === 1) {
                                void handleRemoveItem(item.id);
                                return;
                              }
                              handleUpdateQuantity(item.id, item.quantity - 1);
                            }}
                            className="w-7 h-7 flex items-center justify-center text-xs hover:bg-hover transition-colors"
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className="w-8 h-7 flex items-center justify-center text-xs font-medium border-x border-border-color">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                            className="w-7 h-7 flex items-center justify-center text-xs hover:bg-hover transition-colors"
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-[10px] uppercase tracking-[0.2em] text-text-secondary hover:text-foreground transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {hasUnavailableItems && (
                  <div className="p-4 bg-danger/5">
                    <p className="text-xs text-danger font-medium">
                      Some items are already taken. Remove them from the cart to place your order.
                    </p>
                  </div>
                )}

                <div className="p-4 space-y-2">
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Subtotal</span>
                    <span>{formatTndPrice(totalPrice)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Shipping</span>
                    <span>Free</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold pt-2 border-t border-border-color">
                    <span>Total</span>
                    <span>{formatTndPrice(grandTotal)}</span>
                  </div>
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
                By placing this order you agree to our Terms & Conditions.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
