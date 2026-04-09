import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  output: "standalone",
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
