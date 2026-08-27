import { describe, expect, it } from "vitest";
import { requiresAttachmentDownload } from "./attachment-delivery";

describe("requiresAttachmentDownload", () => {
  it.each([
    "application/xml",
    "image/svg+xml",
    "text/html",
    "text/xml",
  ])("forces %s to download", (mimeType) => {
    expect(requiresAttachmentDownload(mimeType)).toBe(true);
  });

  it.each(["application/pdf", "image/png", "text/plain"])(
    "keeps %s inline",
    (mimeType) => {
      expect(requiresAttachmentDownload(mimeType)).toBe(false);
    },
  );
});
