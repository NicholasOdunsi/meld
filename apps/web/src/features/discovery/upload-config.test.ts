import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { MAX_ATTACHMENT_BYTES } from "./attachment-extractor";

describe("Discovery attachment transport limit", () => {
  it("allows multipart overhead above the app's exact ten-megabyte limit", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe(
      "11mb",
    );
  });
});
