import { extractText } from "unpdf";
import { MAX_ATTACHMENT_BYTES } from "./schemas";

export { MAX_ATTACHMENT_BYTES };
export const MAX_EXTRACTED_TEXT_CHARACTERS = 100_000;

const TEXT_MIME_TYPES = new Set(["text/plain", "text/markdown"]);
const IMAGE_SIGNATURES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

function hasSignature(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function containsAscii(bytes: Uint8Array, needle: string) {
  return new TextDecoder("latin1").decode(bytes).includes(needle);
}

function matchesImageMime(bytes: Uint8Array, mimeType: string) {
  const signature = IMAGE_SIGNATURES[mimeType];
  if (signature) return hasSignature(bytes, signature);
  if (mimeType === "image/webp") {
    return (
      hasSignature(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      [0x57, 0x45, 0x42, 0x50].every(
        (value, index) => bytes[index + 8] === value,
      )
    );
  }
  if (mimeType === "image/gif") {
    return (
      hasSignature(bytes, [0x47, 0x49, 0x46, 0x38]) &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) &&
      bytes[5] === 0x61
    );
  }
  return false;
}

export function normalizeText(value: string) {
  return value
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfText(bytes: Uint8Array) {
  if (!hasSignature(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    throw new Error("The declared MIME type does not match the file.");
  }
  if (containsAscii(bytes, "/Encrypt")) {
    throw new Error("Encrypted PDFs are not supported.");
  }

  try {
    const result = await extractText(bytes, { mergePages: true });
    return result.text;
  } catch {
    throw new Error(
      "The PDF could not be extracted. It may be encrypted or invalid.",
    );
  }
}

export async function extractAttachmentText(input: {
  mimeType: string;
  bytes: Uint8Array;
  caption?: string;
}): Promise<string | null> {
  if (
    input.bytes.byteLength === 0 ||
    input.bytes.byteLength > MAX_ATTACHMENT_BYTES
  ) {
    throw new Error("Attachments must be between 1 byte and 10 MB.");
  }

  if (TEXT_MIME_TYPES.has(input.mimeType)) {
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        input.bytes,
      );
    } catch {
      throw new Error("Text attachments must contain valid UTF-8.");
    }
    return normalizeText(decoded).slice(
      0,
      MAX_EXTRACTED_TEXT_CHARACTERS,
    );
  }

  if (input.mimeType === "application/pdf") {
    return normalizeText(await extractPdfText(input.bytes)).slice(
      0,
      MAX_EXTRACTED_TEXT_CHARACTERS,
    );
  }

  if (input.mimeType.startsWith("image/")) {
    if (!matchesImageMime(input.bytes, input.mimeType)) {
      throw new Error("The declared MIME type does not match the file.");
    }
    if (!input.caption?.trim()) {
      throw new Error("Images require a caption for textual context.");
    }
    return null;
  }

  throw new Error("Unsupported attachment MIME type.");
}
