"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuditMetaCard from "@/components/AuditMetaCard";
import { withAuthRequest } from "@/lib/authClient";

interface AuditActor {
  id: string;
  name: string;
  email: string;
}

interface OrderDetail {
  _id: string; totalPrice: number; orderStatus: string;
  isArchived?: boolean;
  paymentMethod: string; createdAt: string; updatedAt?: string;
  user?: { name: string; email: string; };
  createdBy?: AuditActor | null;
  updatedBy?: AuditActor | null;
  shippingAddress: { fullName: string; street: string; city: string; state: string; zip: string; phone: string; };
  subtotalPrice?: number;
  shippingFee?: number;
  couponCode?: string;
  couponDiscountAmount?: number;
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
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    fetch("/api/auth/me", withAuthRequest()).then((r) => r.json()).then((d) => setUserRole(d.user?.role || "")).catch(() => {});
    fetch(`/api/orders/${id}`, withAuthRequest()).then((r) => r.json()).then((d) => setOrder(d.order)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const updateStatus = async (orderStatus: string) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/orders/${id}`, withAuthRequest({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus }),
      }));
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || "Failed to update order status");
      } else if (d.order) {
        setOrder(d.order);
      }
    } catch {}
    setUpdating(false);
  };

  const deleteOrder = async () => {
    if (!confirm("Delete this order? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${id}`, withAuthRequest({ method: "DELETE" }));
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to delete order");
      } else {
        router.push("/dashboard/orders");
      }
    } catch {
      alert("Failed to delete order");
    }
    setDeleting(false);
  };

  const printOrder = () => {
    window.print();
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "processing": return "text-amber-300 bg-amber-500/10";
      case "confirmed": return "text-sky-300 bg-sky-500/10";
      case "shipping": return "text-violet-300 bg-violet-500/10";
      case "delivered": return "bg-bg-secondary text-text-secondary";
      case "returned": return "text-orange-300 bg-orange-500/10";
      case "canceled": return "text-rose-300 bg-rose-500/10";
      default: return "text-text-secondary bg-bg-secondary";
    }
  };

  if (loading) return <p className="text-xs text-text-secondary animate-pulse">Loading...</p>;
  if (!order) return <p className="text-sm text-text-secondary">Order not found.</p>;
  const isLocked = ["delivered", "canceled", "returned"].includes(order.orderStatus);
  const nextStatuses = ORDER_TRANSITIONS[order.orderStatus] || [];
  const canPrintOrder =
    userRole === "admin" ||
    (userRole === "store_owner" && ["confirmed", "shipping", "delivered", "returned"].includes(order.orderStatus));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold">Order #{order._id.slice(-8).toUpperCase()}</h1>
          <p className="text-xs text-text-secondary">{new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          {order.isArchived ? (
            <span className="text-[10px] px-3 py-1 font-medium uppercase tracking-wider text-neutral-700 bg-neutral-200">
              Archived
            </span>
          ) : (
            <span className="text-[10px] px-3 py-1 font-medium uppercase tracking-wider bg-bg-secondary text-text-secondary">
              Active
            </span>
          )}
          <span className={`text-[10px] px-3 py-1 font-medium uppercase tracking-wider ${statusColor(order.orderStatus)}`}>{order.orderStatus}</span>
        </div>
      </div>

      <div className="flex justify-end gap-3 print:hidden">
        {canPrintOrder && (
          <button
            type="button"
            onClick={printOrder}
            className="border border-border px-4 py-2 text-[10px] uppercase tracking-wider text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            Print Order
          </button>
        )}
        {userRole === "admin" && (
          <button
            type="button"
            onClick={deleteOrder}
            disabled={deleting}
            className="border border-rose-300 text-rose-300 px-4 py-2 text-[10px] uppercase tracking-wider hover:bg-rose-500/10 transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete Order"}
          </button>
        )}
      </div>

      {canPrintOrder && <div className="hidden print:block mx-auto w-[210mm] max-w-full border border-black p-6 space-y-5 bg-white text-black font-sans">
        <div className="flex items-start justify-between border-b border-black pb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em]">LOOKSMAX</p>
            <h2 className="text-xl font-semibold mt-2">BON DE COMMANDE #{order._id.slice(-8).toUpperCase()}</h2>
            <p className="text-xs mt-1">Imprimé le : {new Date().toLocaleString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="border border-black p-4">
            <p className="text-xs uppercase tracking-wider mb-2">Client</p>
            <p>{order.user?.name || order.shippingAddress.fullName}</p>
          </div>
          <div className="border border-black p-4">
            <p className="text-xs uppercase tracking-wider mb-2">Adresse de livraison</p>
            <p>{order.shippingAddress.fullName}</p>
            <p>{order.shippingAddress.street}</p>
            <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}</p>
            <p>{order.shippingAddress.phone}</p>
          </div>
        </div>

        <div className="border border-black">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider">
                <th className="px-3 py-2 border-b border-black">Produit</th>
                <th className="px-3 py-2 border-b border-black">Taille</th>
                <th className="px-3 py-2 border-b border-black">Qté</th>
                <th className="px-3 py-2 border-b border-black text-right">Prix (TND)</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={`${item.productId}-${item.size || ""}-${item.color || ""}-${index}`}>
                  <td className="px-3 py-2 border-b border-black text-xs">{item.name}</td>
                  <td className="px-3 py-2 border-b border-black text-xs">{item.size}</td>
                  <td className="px-3 py-2 border-b border-black text-xs">{item.quantity}</td>
                  <td className="px-3 py-2 border-b border-black text-xs text-right">{(item.price * item.quantity).toFixed(2)} TND</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end text-sm">
          <div className="min-w-56 border border-black p-4">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{(order.subtotalPrice ?? order.totalPrice).toFixed(2)} TND</span>
            </div>
            {!!order.couponCode && (
              <div className="flex items-center justify-between mt-2">
                <span>Coupon {order.couponCode}</span>
                <span>-{(order.couponDiscountAmount ?? 0).toFixed(2)} TND</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>Total</span>
              <span>{order.totalPrice.toFixed(2)} TND</span>
            </div>
          </div>
        </div>
      </div>}

      {/* Status Update */}
      {userRole === "admin" && (
        <div className="bg-bg-card border border-border rounded p-4 print:hidden">
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
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
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
      <div className="bg-bg-card border border-border rounded overflow-hidden print:hidden">
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
                <td className="px-4 py-3 text-xs text-right font-medium">{(item.price * item.quantity).toFixed(2)} TND</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border">
            <tr><td colSpan={4} className="px-4 py-3 text-xs font-semibold text-right">Total</td><td className="px-4 py-3 text-sm font-bold text-right text-accent">{order.totalPrice.toFixed(2)} TND</td></tr>
          </tfoot>
        </table>
      </div>

      {/* Payment */}
      <div className="bg-bg-card border border-border rounded p-4 print:hidden">
        <div>
          <p className="text-xs text-text-secondary uppercase">Payment Method</p>
          <p className="text-sm font-medium">Cash on Delivery</p>
        </div>
      </div>

      <AuditMetaCard
        createdAt={order.createdAt}
        updatedAt={order.updatedAt}
        createdBy={order.createdBy}
        updatedBy={order.updatedBy}
        className="print:hidden"
      />
    </div>
  );
}
