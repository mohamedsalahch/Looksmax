import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOOKSMAX Store",
  description: "Store owner sign in",
  applicationName: "LOOKSMAX",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">{children}</body>
    </html>
  );
}
