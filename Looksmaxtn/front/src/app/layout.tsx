import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import SidePanel from "@/components/SidePanel";
import CartPanel from "@/components/CartPanel";
import ProductRailTray from "@/components/ProductRailTray";
import Footer from "@/components/Footer";
import { CartProvider } from "@/providers/CartContext";
import { AuthProvider } from "@/providers/AuthContext";

export const metadata: Metadata = {
  title: "LOOKSMAX — Premium Menswear",
  description: "Discover the latest in men's fashion. Shop curated collections, streetwear essentials, and community-driven style at LOOKSMAX.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <AuthProvider>
          <CartProvider>
            <Header />
            <SidePanel />
            <CartPanel />
            <ProductRailTray />
            <main className="flex-1">{children}</main>
            <Footer />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
