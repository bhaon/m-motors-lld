/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  /**
   * Proxy les appels `/api/*` vers le backend FastAPI (client + fetch relatif en dev).
   * Aligné sur fetchVehicles (API_INTERNAL_URL, ou backend Docker en prod, ou localhost en dev).
   */
  async rewrites() {
    const fromEnv =
      process.env.BACKEND_URL?.trim() || process.env.API_INTERNAL_URL?.trim();
    const backend = fromEnv
      ? fromEnv.replace(/\/$/, "")
      : process.env.NODE_ENV === "production"
        ? "https://backend:8000"
        : "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

module.exports = nextConfig;
