import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 4 MB files plus multipart overhead; below Vercel's 4.5 MB ceiling.
      bodySizeLimit: "4300kb",
    },
  },
};

export default nextConfig;
