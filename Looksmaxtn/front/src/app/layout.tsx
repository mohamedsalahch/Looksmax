import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import TikTokPixel from "@/components/TikTokPixel";
import { buildPageMetadata, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  ...buildPageMetadata({
    title: "LOOKSMAX Tunisia | Men's Fashion, Shoes & Perfumes",
    description:
      "Shop curated men's fashion, shoes, perfumes, and outfit essentials in Tunisia with LOOKSMAX.",
    path: "/",
  }),
  applicationName: "LOOKSMAX",
  category: "fashion",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
        <TikTokPixel />
      </body>
    </html>
  );
}
