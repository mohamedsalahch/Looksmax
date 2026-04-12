import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  output: "standalone",
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
