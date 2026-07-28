import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: {
    // The workspace rail pins its create action at bottom-left. Keep Next's
    // development-only tool trigger out of that hit target in browser tests.
    position:
      process.env.MELD_E2E_FAKE_WORKSPACES === "true"
        ? "bottom-right"
        : "bottom-left",
  },
  experimental: {
    // Next 16 defaults Server Actions to 1 MB. Keep enough transport
    // headroom for multipart encoding while schemas enforce exactly 10 MB.
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
