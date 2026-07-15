import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/": ["./index.html"],
    "/resume": ["./resume/index.html"],
    "/career": ["./career/index.html"],
    "/portfolio": ["./portfolio/index.html"],
    "/admin": ["./admin/**/*"],
    "/api/admin/assets/*": ["./admin/**/*"],
  },
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/resume/index.html", destination: "/resume/", permanent: true },
      { source: "/career/index.html", destination: "/career/", permanent: true },
      { source: "/portfolio/index.html", destination: "/portfolio/", permanent: true },
    ];
  },
};

export default nextConfig;
