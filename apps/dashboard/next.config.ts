import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mentionish/types"],
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
