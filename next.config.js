/** @type {import('next').NextConfig} */
const config = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // Disable webpack persistent file cache in dev — keeps causing manifest races
  webpack: (cfg, { dev }) => {
    if (dev) cfg.cache = { type: "memory" };
    return cfg;
  },
};

module.exports = config;
