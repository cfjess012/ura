import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdf-parse (pdfjs underneath) and mammoth do not survive webpack
  // bundling — they have to be require()d as real Node modules at runtime.
  // Carried over from the prior platform, where without this ANY page
  // importing the actions module crashed at module-eval with "Object
  // .defineProperty called on non-object", before a single upload happened.
  serverExternalPackages: ["pdf-parse", "mammoth"],
  experimental: {
    serverActions: {
      // A file now travels to the server as bytes rather than as text read
      // in the browser, and the default 1 MB cap sits below what a mid-size
      // .docx weighs. The per-file limit stays enforced in the UI, where it
      // can say something useful; this only stops the platform refusing at
      // the door with nothing to say.
      bodySizeLimit: "10mb",
    },
  },
  // The end-to-end suite runs its own server against its own database, so it
  // needs its own build directory — two dev servers sharing `.next` delete
  // each other's chunks. Unset everywhere else, which keeps the default.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
