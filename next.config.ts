import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = process.env.BACKEND_URL?.replace(/\/$/, "");
    return {
      beforeFiles: backend
        ? [
            {
              source: "/api/customer/:path*",
              destination: `${backend}/api/customer/:path*`,
            },
            {
              source: "/api/payments/:path*",
              destination: `${backend}/api/payments/:path*`,
            },
            {
              source: "/api/jobs/:path*",
              destination: `${backend}/api/jobs/:path*`,
            },
            {
              source: "/api/registration",
              destination: `${backend}/api/registration`,
            },
          ]
        : [],
      afterFiles: [],
      fallback: [],
    };
  },
  experimental: {
    serverActions: {
      // 4 MB files plus multipart overhead; below Vercel's 4.5 MB ceiling.
      bodySizeLimit: "4300kb",
    },
  },
};

export default nextConfig;
