"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/providers/AuthContext";
import { CartProvider } from "@/providers/CartContext";
import SiteChrome from "@/components/SiteChrome";

const AUTH_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  return (
    <AuthProvider>
      {isAuthRoute ? (
        children
      ) : (
        <CartProvider>
          <SiteChrome>{children}</SiteChrome>
        </CartProvider>
      )}
    </AuthProvider>
  );
}
