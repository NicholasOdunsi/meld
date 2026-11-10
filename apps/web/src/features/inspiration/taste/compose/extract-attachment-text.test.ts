import { describe, expect, it } from "vitest";
import { attachmentKind, extractAttachmentText, ATTACHMENT_MAX_BYTES } from "./extract-attachment-text";

const enc = (s: string) => new TextEncoder().encode(s);

describe("attachmentKind", () => {
  it("maps types by extension and mime", () => {
    expect(attachmentKind("Brand.PDF", "application/pdf")).toBe("pdf");
    expect(attachmentKind("g.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
    expect(attachmentKind("notes.md", "text/markdown")).toBe("text");
    expect(attachmentKind("a.txt", "")).toBe("text");
    expect(attachmentKind("shot.png", "image/png")).toBe("image");
    expect(attachmentKind("x.exe", "application/octet-stream")).toBeNull();
  });
});

describe("extractAttachmentText", () => {
  it("reads plain text and markdown", async () => {
    const out = await extractAttachmentText({ name: "notes.md", mimeType: "text/markdown", bytes: enc("# Calm\n\nLots of white space") });
    expect(out).toEqual({ ok: true, name: "notes.md", text: "# Calm Lots of white space", pages: null });
  });
  it("rejects oversized, unsupported and empty files", async () => {
    expect(await extractAttachmentText({ name: "a.txt", mimeType: "text/plain", bytes: new Uint8Array(ATTACHMENT_MAX_BYTES + 1) })).toMatchObject({ ok: false, reason: "too_large" });
    expect(await extractAttachmentText({ name: "a.exe", mimeType: "application/octet-stream", bytes: enc("x") })).toMatchObject({ ok: false, reason: "unsupported" });
    expect(await extractAttachmentText({ name: "a.txt", mimeType: "text/plain", bytes: enc("   ") })).toMatchObject({ ok: false, reason: "empty" });
  });
  it("reports a broken PDF as unreadable", async () => {
    expect(await extractAttachmentText({ name: "a.pdf", mimeType: "application/pdf", bytes: enc("not a pdf") })).toMatchObject({ ok: false, reason: "unreadable" });
  });
  it("reports a broken DOCX as unreadable", async () => {
    expect(await extractAttachmentText({ name: "a.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: enc("nope") })).toMatchObject({ ok: false, reason: "unreadable" });
  });
});
