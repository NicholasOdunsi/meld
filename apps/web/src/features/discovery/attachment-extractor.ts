import { extractText } from "unpdf";
import { MAX_ATTACHMENT_BYTES } from "./schemas";

export { MAX_ATTACHMENT_BYTES };
export const MAX_EXTRACTED_TEXT_CHARACTERS = 100_000;

const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "text/yaml",
  "application/yaml",
  "application/json",
  "application/xml",
  "text/xml",
]);
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

// Strip control characters (keeping tab, newline, carriage return), so
// extracted text stays clean for the agent. Written as a codepoint filter to
// avoid embedding control-character literals.
//
// The C1 range (128-159) is cleared for genuinely undefined bytes only. It
// used to double as the smart-punctuation cleanup, because Node 20's
// TextDecoder("windows-1252") passed 0x92 straight through as U+0092 rather
// than mapping it to U+2019 -- which meant every curly quote in an exported
// Word/Notion document was silently deleted here, the opposite of what the
// windows-1252 fallback exists to achieve. Node 22 decodes those bytes
// correctly, so the punctuation now survives and only real controls are cut.
function stripControlCharacters(value: string) {
  let result = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const isKeptWhitespace = code === 9 || code === 10 || code === 13;
    const isControl =
      code < 32 || code === 127 || (code >= 128 && code <= 159);
    if (isKeptWhitespace || !isControl) {
      result += character;
    }
  }
  return result;
}

export function normalizeText(value: string) {
  return stripControlCharacters(value)
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Text attachments are usually UTF-8, but documents exported from Word,
// Google Docs, Notion, etc. are frequently windows-1252 (curly quotes, em
// dashes, non-breaking spaces). Decode strictly as UTF-8 first; on failure
// fall back to windows-1252 so a real document is read rather than rejected.
function decodeTextAttachment(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
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

  if (input.mimeType === "text/html") {
    const decoded = decodeTextAttachment(input.bytes);
    const stripped = decoded
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    return normalizeText(stripped).slice(
      0,
      MAX_EXTRACTED_TEXT_CHARACTERS,
    );
  }

  if (TEXT_MIME_TYPES.has(input.mimeType)) {
    const decoded = decodeTextAttachment(input.bytes);
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

  if (input.mimeType === "image/svg+xml") {
    // SVG is XML text with no binary signature to match, so validate that the
    // payload actually looks like SVG. It then behaves like any other image:
    // rendered by its URL and described for the agent by its required caption.
    if (!containsAscii(input.bytes, "<svg")) {
      throw new Error("The declared MIME type does not match the file.");
    }
    if (!input.caption?.trim()) {
      throw new Error("Images require a caption for textual context.");
    }
    return null;
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
