import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The end-to-end suite runs its own server against its own database, so it
  // needs its own build directory — two dev servers sharing `.next` delete
  // each other's chunks. Unset everywhere else, which keeps the default.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
