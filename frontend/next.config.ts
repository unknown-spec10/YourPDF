import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desktop-first distribution: the app ships as a Tauri window and the FastAPI sidecar runs
  // on loopback as the API. Static export also keeps the web build portable if it is ever
  // re-hosted as plain files.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
