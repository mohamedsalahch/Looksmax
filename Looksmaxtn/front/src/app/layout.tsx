import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/providers/CartContext";
import { AuthProvider } from "@/providers/AuthContext";
import SiteChrome from "@/components/SiteChrome";

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
            <SiteChrome>{children}</SiteChrome>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
