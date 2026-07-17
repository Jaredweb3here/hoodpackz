import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "financialmodelingprep.com" },
      { protocol: "https", hostname: "logo.clearbit.com" },
    ],
  },
};

export default nextConfig;
