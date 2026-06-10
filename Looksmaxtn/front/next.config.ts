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
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

export default nextConfig;
