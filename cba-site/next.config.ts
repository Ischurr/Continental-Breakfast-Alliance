import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/trash-talk', destination: '/message-board', permanent: true },
      { source: '/polls', destination: '/message-board', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'a.espncdn.com',
        pathname: '/i/headshots/**',
      },
    ],
  },
};

export default nextConfig;
