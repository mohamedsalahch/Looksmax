"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { AuthProvider } from "@/providers/AuthContext";
import { CartProvider } from "@/providers/CartContext";
import SiteChrome from "@/components/SiteChrome";
import { isReloadNavigation } from "@/lib/navigationState";

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

  useLayoutEffect(() => {
    if (!isReloadNavigation()) return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

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
