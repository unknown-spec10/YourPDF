import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desktop-first distribution (decided 2026-11-01): the app ships as a local Electron build and
  // the FastAPI sidecar serves this export from the same origin. Static export also keeps the
  // web build portable if it is ever re-hosted as plain files.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
