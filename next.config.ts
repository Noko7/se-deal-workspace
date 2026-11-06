import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server's client assets (HMR, JS chunks) to load when the app
  // is opened via the machine's LAN IP rather than localhost. Without this,
  // Next.js blocks cross-origin dev resources and the page never hydrates,
  // leaving every button/filter/interaction dead.
  allowedDevOrigins: ["10.38.32.123"],
};

export default nextConfig;
