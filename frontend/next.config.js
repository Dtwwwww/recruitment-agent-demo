/** @type {import('next').NextConfig} */
const nextConfig = {
  // 长文本JD解析可能需要60秒+
  experimental: {
    proxyTimeout: 120_000,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8002/api/:path*',
      },
      {
        source: '/ws/:path*',
        destination: 'http://localhost:8002/ws/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
