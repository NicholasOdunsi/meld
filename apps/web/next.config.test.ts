import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "@/features/rooms/schemas";
import nextConfig from "./next.config";

describe("Next local development configuration", () => {
  it("allows the canonical 127.0.0.1 development origin", () => {
    expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
  });

  // Moved here from features/rooms/upload-config.test.ts, which had no
  // upload-config.ts to sit beside. The subject of the assertion is this
  // config's transport limit; the room constant is the value it must
  // clear, with room for multipart overhead.
  it("allows multipart overhead above the app's exact ten-megabyte limit", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe(
      "11mb",
    );
  });
});
