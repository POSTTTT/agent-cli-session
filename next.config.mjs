/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hide the Next.js dev tools badge in the bottom-left corner.
  devIndicators: false,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
