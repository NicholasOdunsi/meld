import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_EXTRACTED_TEXT_CHARACTERS,
  extractAttachmentText,
} from "./attachment-extractor";

const encoder = new TextEncoder();

describe("extractAttachmentText", () => {
  it("decodes UTF-8 text, normalizes it, and caps the AI-safe extraction", async () => {
    const input = `  Customer\u0000 interviews \r\n\r\n ${"agree ".repeat(
      30_000,
    )}`;

    const extracted = await extractAttachmentText({
      mimeType: "text/plain",
      bytes: encoder.encode(input),
    });

    expect(extracted).not.toContain("\u0000");
    expect(extracted).not.toContain("\r");
    expect(extracted).toHaveLength(MAX_EXTRACTED_TEXT_CHARACTERS);
    expect(extracted?.startsWith("Customer interviews\n\n")).toBe(true);
  });

  it("rejects malformed UTF-8 instead of replacing invalid bytes", async () => {
    await expect(
      extractAttachmentText({
        mimeType: "text/markdown",
        bytes: new Uint8Array([0xc3, 0x28]),
      }),
    ).rejects.toThrow("valid UTF-8");
  });

  it("rejects files larger than ten megabytes before extraction", async () => {
    await expect(
      extractAttachmentText({
        mimeType: "text/plain",
        bytes: new Uint8Array(MAX_ATTACHMENT_BYTES + 1),
      }),
    ).rejects.toThrow("10 MB");
  });

  it("rejects encrypted PDFs without attempting to extract them", async () => {
    await expect(
      extractAttachmentText({
        mimeType: "application/pdf",
        bytes: encoder.encode("%PDF-1.7\n1 0 obj\n<< /Encrypt 2 0 R >>"),
      }),
    ).rejects.toThrow("Encrypted PDFs");
  });

  it("rejects a declared PDF whose bytes do not have a PDF signature", async () => {
    await expect(
      extractAttachmentText({
        mimeType: "application/pdf",
        bytes: encoder.encode("not a pdf"),
      }),
    ).rejects.toThrow("does not match");
  });

  it("keeps images out of extracted text and requires a caption", async () => {
    await expect(
      extractAttachmentText({
        mimeType: "image/png",
        bytes: new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]),
        caption: "",
      }),
    ).rejects.toThrow("caption");

    await expect(
      extractAttachmentText({
        mimeType: "image/png",
        bytes: new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]),
        caption: "Prototype navigation",
      }),
    ).resolves.toBeNull();
  });

  it("rejects unsupported MIME types", async () => {
    await expect(
      extractAttachmentText({
        mimeType: "application/zip",
        bytes: encoder.encode("archive"),
      }),
    ).rejects.toThrow("Unsupported");
  });

  it("requires the WEBP marker in addition to a generic RIFF header", async () => {
    await expect(
      extractAttachmentText({
        mimeType: "image/webp",
        bytes: new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56,
          0x45,
        ]),
        caption: "Not really an image",
      }),
    ).rejects.toThrow("does not match");
  });
});
