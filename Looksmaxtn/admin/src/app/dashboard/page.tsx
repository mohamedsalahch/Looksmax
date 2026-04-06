"use client";

import { useEffect, useState } from "react";

interface Stats {
  totalProducts: number;
  totalOrders: number;
  totalUsers: number;
  totalRevenue: number;
  pendingOrders: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  if (!stats) return <p className="text-xs text-text-secondary animate-pulse">Loading dashboard...</p>;

  const cards = [
    { label: "Total Revenue", value: `$${stats.totalRevenue.toFixed(2)}`, icon: "💰", color: "text-success" },
    { label: "Total Orders", value: stats.totalOrders, icon: "🛒", color: "text-info" },
    { label: "Pending Orders", value: stats.pendingOrders, icon: "⏳", color: "text-warning" },
    { label: "Products", value: stats.totalProducts, icon: "📦", color: "text-accent" },
    { label: "Users", value: stats.totalUsers, icon: "👥", color: "text-info" },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-wide mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="stat-card rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-[10px] text-text-secondary uppercase tracking-wider mt-1">{card.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
