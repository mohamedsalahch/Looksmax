"use client";

import Footer from "@/components/Footer";
import Header from "@/components/Header";
import SidePanel from "@/components/SidePanel";
import CartPanel from "@/components/CartPanel";

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <SidePanel />
      <CartPanel />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
