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

  it("falls back to windows-1252 for non-UTF-8 text instead of rejecting it", async () => {
    // 0x92 is a windows-1252 right single quote (U+2019) and invalid as UTF-8;
    // exported docs (Word/Notion/Google Docs) routinely contain these bytes.
    const extracted = await extractAttachmentText({
      mimeType: "text/markdown",
      bytes: new Uint8Array([0x49, 0x74, 0x92, 0x73]),
    });
    // No throw, and the punctuation survives: 0x92 maps to U+2019, which is
    // the whole point of falling back to windows-1252 rather than rejecting
    // the file.
    expect(extracted).toBe("It’s");
  });

  it("falls back to windows-1252 for non-UTF-8 html", async () => {
    const extracted = await extractAttachmentText({
      mimeType: "text/html",
      // <p>It’s</p> with a windows-1252 apostrophe (0x92)
      bytes: new Uint8Array([
        0x3c, 0x70, 0x3e, 0x49, 0x74, 0x92, 0x73, 0x3c, 0x2f, 0x70, 0x3e,
      ]),
    });
    expect(extracted).toBe("It’s");
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

  it("accepts an SVG with a caption and rejects a caption-less or spoofed one", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';

    await expect(
      extractAttachmentText({
        mimeType: "image/svg+xml",
        bytes: encoder.encode(svg),
        caption: "Logo mark",
      }),
    ).resolves.toBeNull();

    await expect(
      extractAttachmentText({
        mimeType: "image/svg+xml",
        bytes: encoder.encode(svg),
        caption: "",
      }),
    ).rejects.toThrow("caption");

    await expect(
      extractAttachmentText({
        mimeType: "image/svg+xml",
        bytes: encoder.encode("<html><body>not svg</body></html>"),
        caption: "Pretending to be an SVG",
      }),
    ).rejects.toThrow("does not match");
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

  it("extracts readable text from an HTML export", async () => {
    const html =
      "<html><head><style>p{color:red}</style><script>alert(1)</script></head>" +
      "<body><h1>Checkout</h1><p>Users abandon at payment.</p></body></html>";

    const text = await extractAttachmentText({
      mimeType: "text/html",
      bytes: new TextEncoder().encode(html),
    });

    expect(text).toBe("Checkout Users abandon at payment.");
  });
});

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("extractAttachmentText text family", () => {
  it("reads CSV as plain text", async () => {
    const text = await extractAttachmentText({
      mimeType: "text/csv",
      bytes: bytesOf("name,role\nAda,PM"),
    });
    expect(text).toBe("name,role\nAda,PM");
  });

  it("reads JSON as plain text", async () => {
    const text = await extractAttachmentText({
      mimeType: "application/json",
      bytes: bytesOf('{"goal":"ship"}'),
    });
    expect(text).toBe('{"goal":"ship"}');
  });

  it("reads YAML as plain text", async () => {
    const text = await extractAttachmentText({
      mimeType: "text/yaml",
      bytes: bytesOf("goal: ship"),
    });
    expect(text).toBe("goal: ship");
  });
});
