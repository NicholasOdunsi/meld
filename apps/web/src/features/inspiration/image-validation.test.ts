import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sniffMimeType, validateImageBytes } from "./image-validation";

// A PNG header is enough for both sniffing and image-size, which reads IHDR.
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

const JPEG_1X1 = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
    "base64",
  ),
);
const WEBP_1X1 = Uint8Array.from(
  Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64"),
);

describe("sniffMimeType", () => {
  it("recognises png, jpeg, and webp from magic bytes", () => {
    expect(sniffMimeType(pngHeader(1, 1))).toBe("image/png");
    expect(sniffMimeType(JPEG_1X1)).toBe("image/jpeg");
    expect(sniffMimeType(WEBP_1X1)).toBe("image/webp");
  });

  it("rejects everything else, including a text file named .png", () => {
    expect(sniffMimeType(new TextEncoder().encode("hello.png"))).toBeNull();
    expect(sniffMimeType(new TextEncoder().encode("GIF89a......"))).toBeNull();
    expect(sniffMimeType(new Uint8Array())).toBeNull();
  });
});

describe("validateImageBytes", () => {
  it("returns type, dimensions, size, and sha256 for a valid image", () => {
    const bytes = pngHeader(800, 600);
    expect(validateImageBytes(bytes)).toEqual({
      ok: true,
      image: {
        mimeType: "image/png",
        width: 800,
        height: 600,
        byteSize: bytes.byteLength,
        contentHash: createHash("sha256").update(bytes).digest("hex"),
      },
    });
  });

  it("reads jpeg and webp dimensions", () => {
    expect(validateImageBytes(JPEG_1X1)).toMatchObject({ ok: true, image: { width: 1, height: 1 } });
    expect(validateImageBytes(WEBP_1X1)).toMatchObject({ ok: true, image: { width: 1, height: 1 } });
  });

  it("rejects unknown types, oversize edges, oversize files, and empty input", () => {
    expect(validateImageBytes(new TextEncoder().encode("nope"))).toEqual({ ok: false, error: "unsupported_type" });
    expect(validateImageBytes(pngHeader(5000, 10))).toEqual({ ok: false, error: "too_large" });
    expect(validateImageBytes(new Uint8Array(10_485_761))).toEqual({ ok: false, error: "too_large" });
    expect(validateImageBytes(new Uint8Array())).toEqual({ ok: false, error: "invalid_image" });
  });

  it("rejects bytes that sniff as an image but cannot be measured", () => {
    expect(validateImageBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toEqual({ ok: false, error: "invalid_image" });
  });
});
