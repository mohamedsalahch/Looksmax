import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3004";

    return [
      {
        source: "/api/:path*",
        destination: `${backendBaseUrl}/api/store/:path*`,
      },
    ];
  },
};

export default nextConfig;
