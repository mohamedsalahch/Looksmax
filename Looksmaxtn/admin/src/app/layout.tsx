import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOOKSMAX Admin",
  description: "Admin dashboard for LOOKSMAX store management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans bg-bg-primary text-text-primary">{children}</body>
    </html>
  );
}
