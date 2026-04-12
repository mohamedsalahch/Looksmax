/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  output: "standalone",
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
};
export default nextConfig;
