import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/outline', destination: '/', permanent: false },
      { source: '/characters', destination: '/', permanent: false },
      { source: '/world', destination: '/', permanent: false },
      { source: '/brainstorm', destination: '/', permanent: false },
      { source: '/write', destination: '/', permanent: false },
    ]
  },
};

export default nextConfig;
