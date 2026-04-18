import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
