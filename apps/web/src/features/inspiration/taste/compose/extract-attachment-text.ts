import "server-only";

import mammoth from "mammoth";
import { extractText } from "unpdf";

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TEXT_MAX_CHARS = 20_000;
export type AttachmentKind = "pdf" | "docx" | "text" | "image";
export type AttachmentText =
  | { ok: true; name: string; text: string; pages: { page: number; text: string }[] | null }
  | { ok: false; name: string; reason: "unsupported" | "too_large" | "unreadable" | "empty" };

export function attachmentKind(name: string, mimeType: string): AttachmentKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (ext === "docx" || mimeType.includes("wordprocessingml")) return "docx";
  if (["txt", "md", "markdown"].includes(ext) || mimeType.startsWith("text/")) return "text";
  if (["png", "jpg", "jpeg", "webp"].includes(ext) || /^image\/(png|jpeg|webp)$/.test(mimeType)) return "image";
  return null;
}

const squash = (value: string) => value.replace(/\s+/g, " ").trim();

export async function extractAttachmentText(file: {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<AttachmentText> {
  const { name } = file;
  const kind = attachmentKind(name, file.mimeType);
  if (!kind || kind === "image") return { ok: false, name, reason: "unsupported" };
  if (file.bytes.byteLength > ATTACHMENT_MAX_BYTES) return { ok: false, name, reason: "too_large" };
  try {
    if (kind === "text") {
      const text = squash(new TextDecoder("utf-8").decode(file.bytes)).slice(0, ATTACHMENT_TEXT_MAX_CHARS);
      return text ? { ok: true, name, text, pages: null } : { ok: false, name, reason: "empty" };
    }
    if (kind === "docx") {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) });
      const text = squash(value).slice(0, ATTACHMENT_TEXT_MAX_CHARS);
      return text ? { ok: true, name, text, pages: null } : { ok: false, name, reason: "empty" };
    }
    const result = await extractText(file.bytes, { mergePages: false });
    const pages = (result.text as string[])
      .map((text, index) => ({ page: index + 1, text: squash(text) }))
      .filter((p) => p.text);
    const joined = pages.map((p) => `[page ${p.page}] ${p.text}`).join(" ").slice(0, ATTACHMENT_TEXT_MAX_CHARS);
    return joined ? { ok: true, name, text: joined, pages } : { ok: false, name, reason: "empty" };
  } catch {
    return { ok: false, name, reason: "unreadable" };
  }
}
