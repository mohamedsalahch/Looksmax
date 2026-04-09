/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  output: "standalone",
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};
export default nextConfig;
