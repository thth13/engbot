import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@engbot/core"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  turbopack: { root: path.resolve(__dirname, "../..") },
  allowedDevOrigins: process.env.APP_URL
    ? [new URL(process.env.APP_URL).hostname]
    : [],
};

export default nextConfig;
