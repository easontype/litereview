import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist 的 fake worker 走動態 import，被 bundle 後路徑會失效，保持外部化直接吃 node_modules
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
