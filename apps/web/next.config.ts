import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next 16 defaults Server Actions to 1 MB. Keep enough transport
    // headroom for multipart encoding while schemas enforce exactly 10 MB.
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
