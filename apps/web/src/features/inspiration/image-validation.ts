import "server-only";

import { createHash } from "node:crypto";
import { INSPIRATION_LIMITS, type InspirationMimeType } from "@meld/contracts";
import { imageSize } from "image-size";

export type ImageValidationError = "unsupported_type" | "too_large" | "invalid_image";
export type ValidatedImage = {
  mimeType: InspirationMimeType;
  width: number;
  height: number;
  byteSize: number;
  contentHash: string;
};
export type ImageValidationResult = { ok: true; image: ValidatedImage } | { ok: false; error: ImageValidationError };

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

// The client's Content-Type and file name are never trusted: the type comes
// from the bytes themselves.
export function sniffMimeType(bytes: Uint8Array): InspirationMimeType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function validateImageBytes(bytes: Uint8Array): ImageValidationResult {
  if (bytes.byteLength === 0) return { ok: false, error: "invalid_image" };
  if (bytes.byteLength > INSPIRATION_LIMITS.maxBytes) return { ok: false, error: "too_large" };

  const mimeType = sniffMimeType(bytes);
  if (!mimeType) return { ok: false, error: "unsupported_type" };

  let width: number | undefined;
  let height: number | undefined;
  try {
    ({ width, height } = imageSize(bytes));
  } catch {
    return { ok: false, error: "invalid_image" };
  }
  if (!width || !height) return { ok: false, error: "invalid_image" };
  if (Math.max(width, height) > INSPIRATION_LIMITS.maxEdge) return { ok: false, error: "too_large" };

  return {
    ok: true,
    image: {
      mimeType,
      width,
      height,
      byteSize: bytes.byteLength,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}
