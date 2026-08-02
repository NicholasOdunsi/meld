import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second Next development server cannot share `.next`'s lock with the
  // developer's running app. Playwright opts into an isolated build directory
  // so MELD_E2E_PORT can genuinely run the suite beside localhost:3000.
  distDir: process.env.MELD_E2E_DIST_DIR || undefined,
  allowedDevOrigins: ["127.0.0.1"],
  // Next's floating development trigger overlaps real controls in both
  // bottom corners. E2E still exercises the development server, but does not
  // need that trigger; ordinary local development keeps Next's default.
  devIndicators:
    process.env.MELD_E2E_FAKE_WORKSPACES === "true"
      ? false
      : undefined,
  experimental: {
    // Next 16 defaults Server Actions to 1 MB. Keep enough transport
    // headroom for multipart encoding while schemas enforce exactly 10 MB.
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
  serverExternalPackages: ["unpdf", "pdfjs-dist"],
};

export default nextConfig;
