/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't let lint findings block a production deploy (typecheck still runs in CI
  // via `npm run typecheck`).
  eslint: { ignoreDuringBuilds: true },
  // @react-pdf/renderer and its deps pull in optional native/node bits that
  // must not be bundled into the serverless function graph.
  experimental: {
    serverComponentsExternalPackages: [
      "@react-pdf/renderer",
      "cheerio",
    ],
  },
};

module.exports = nextConfig;
