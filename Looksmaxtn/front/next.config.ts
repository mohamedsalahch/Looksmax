import type { NextConfig } from "next";

const r2Host = process.env.NEXT_PUBLIC_R2_PUBLIC_HOST?.trim();

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  images: {
    remotePatterns: r2Host
      ? [
          {
            protocol: "https",
            hostname: r2Host,
          },
        ]
      : [],
  },
};

export default nextConfig;
