import type { NextConfig } from "next";

const r2Host = process.env.NEXT_PUBLIC_R2_PUBLIC_HOST?.trim();

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  output: "standalone",
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
