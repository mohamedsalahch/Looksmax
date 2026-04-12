"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthContext";
import { withAuthRequest } from "@/lib/authClient";
import { formatTndPrice } from "@/lib/formatPrice";
import { formatStoreDate } from "@/lib/dateFormat";

interface Order {
  _id: string;
  totalPrice: number;
  orderStatus: string;
  isArchived?: boolean;
  createdAt: string;
  items: { name: string; quantity: number }[];
}

export default function AccountOverview() {
  const { user } = useAuth();
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);

  useEffect(() => {
    fetch("/api/orders", withAuthRequest())
      .then((r) => r.json())
      .then((data) => setRecentOrders((data.orders || []).slice(0, 3)))
      .catch(() => {});
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

  return (
    <div className="space-y-8">
      {/* Address Card */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-4 text-text-secondary">
          Saved Address
        </h2>
        {user?.address?.street ? (
          <div className="border border-border-color p-4 text-sm space-y-1">
            <p className="font-medium">{user.name}</p>
            <p className="text-text-secondary text-xs">{user.address.street}</p>
            <p className="text-text-secondary text-xs">
              {user.address.city}, {user.address.state} {user.address.zip}
            </p>
            {user.address.phone && (
              <p className="text-text-secondary text-xs">{user.address.phone}</p>
            )}
            <Link
              href="/account/settings"
              className="text-xs text-foreground underline underline-offset-2 mt-2 inline-block"
            >
              Edit Address
            </Link>
          </div>
        ) : (
          <div className="border border-border-color border-dashed p-6 text-center">
            <p className="text-xs text-text-secondary mb-2">No address saved yet</p>
            <Link
              href="/account/settings"
              className="text-xs text-foreground underline underline-offset-2"
            >
              Add Address
            </Link>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-4 text-text-secondary">
          Outfit Studio
        </h2>
        <div className="border border-border-color p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-foreground">Build outfits around your body profile.</p>
              <p className="text-xs text-text-secondary mt-1">
                Save your height, weight, size, and profile photo, then drag products onto body zones.
              </p>
            </div>
            <Link
              href="/studio"
              className="bg-foreground text-background px-4 py-2 text-[10px] uppercase tracking-wider"
            >
              Open Studio
            </Link>
          </div>

          <div className="flex items-center justify-between border-t border-border-color pt-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary">Studio Profile</p>
              <p className="text-xs text-text-secondary mt-1">
                Keep your measurements and photos ready for outfit generation.
              </p>
            </div>
            <Link
              href="/account/settings"
              className="text-[10px] uppercase tracking-[0.15em] text-foreground underline underline-offset-2"
            >
              Edit
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Recent Orders
          </h2>
          <Link
            href="/account/orders"
            className="text-xs text-foreground underline underline-offset-2"
          >
            View All
          </Link>
        </div>
        {recentOrders.length > 0 ? (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <Link
                key={order._id}
                href={`/account/orders/${order._id}`}
                className="block border border-border-color p-4 hover:bg-hover transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-text-secondary font-mono">
                    #{order._id.slice(-8).toUpperCase()}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${statusColor(order.orderStatus)}`}>
                    {order.orderStatus}
                  </span>
                </div>
                <p className="text-xs text-text-secondary">
                  {order.items.map((i) => `${i.name} (x${i.quantity})`).join(", ")}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs font-medium">{formatTndPrice(order.totalPrice)}</span>
                  <span className="text-[10px] text-text-secondary">
                    {formatStoreDate(order.createdAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="border border-border-color border-dashed p-6 text-center">
            <p className="text-xs text-text-secondary">No orders yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
