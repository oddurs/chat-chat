import type { NextConfig } from "next";

// GitHub Pages serves a project site from /<repo>, so the base path is injected at build time
// and left empty for local development.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export", // the whole site is a build-time render of the committed corpus
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
