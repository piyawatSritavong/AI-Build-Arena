import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@arena/core", "@arena/challenges", "@arena/mcp"],
};

export default nextConfig;
