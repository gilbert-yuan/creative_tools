import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    emotion: true,
  },
  async rewrites() {
    return [
      {
        source: '/data/:path*',
        destination: 'http://127.0.0.1:3001/data/:path*',
      },
    ];
  },
};

export default nextConfig;
