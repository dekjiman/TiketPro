/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { 
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost', port: '4000' },
    ] 
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:4000/api/:path*' },
      { source: '/public/:path*', destination: 'http://localhost:4000/public/:path*' },
    ];
  },
};

module.exports = nextConfig;