/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3004";

    return [
      {
        source: "/api/:path*",
        destination: `${backendBaseUrl}/api/admin/:path*`,
      },
    ];
  },
};
export default nextConfig;
