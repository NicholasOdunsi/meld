import { describe, expect, it } from "vitest";
import {
  ACCEPTED_ATTACHMENT_FILE_TYPES,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  DOCX_MIME_TYPE,
  PPTX_MIME_TYPE,
  resolveMimeType,
} from "./attachment-mime";
import { validateQueuedFiles } from "./components/composer-model";
import { AttachmentInputSchema } from "./schemas";

// Three separate hand-maintained copies of "what we accept" -- the picker's
// accept attribute, the composer's client gate and the server schema -- is what
// let .docx/.pptx be added to one and rejected by the others. These tests pin
// them to a single list so the next format added cannot half-land.

function fakeFile(name: string, type: string, size = 1024): File {
  return { name, type, size, lastModified: 1 } as unknown as File;
}

describe("attachment allow-list", () => {
  it("offers exactly the types it will accept", () => {
    // Every extension in the picker must resolve to an allowed MIME type.
    const extensions = ACCEPTED_ATTACHMENT_FILE_TYPES.split(",").filter((entry) =>
      entry.startsWith("."),
    );
    for (const extension of extensions) {
      const mimeType = resolveMimeType(`sample${extension}`, "");
      expect(
        ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType),
        `${extension} resolves to ${mimeType || "<nothing>"}, which is not allowed`,
      ).toBe(true);
    }
  });

  it.each([
    ["plan.docx", DOCX_MIME_TYPE],
    ["deck.pptx", PPTX_MIME_TYPE],
  ])("lets %s past the composer's own gate", (name, mimeType) => {
    const { errors, accepted } = validateQueuedFiles(
      [],
      [fakeFile(name, mimeType)],
    );
    expect(errors).toEqual([]);
    expect(accepted).toHaveLength(1);
  });

  it.each([
    ["plan.docx", DOCX_MIME_TYPE],
    ["deck.pptx", PPTX_MIME_TYPE],
  ])("lets %s past the server schema too", (fileName, mimeType) => {
    expect(() =>
      AttachmentInputSchema.parse({
        roomId: "10000000-0000-4000-8000-000000000001",
        fileName,
        mimeType,
        size: 1024,
      }),
    ).not.toThrow();
  });

  it("still refuses a type nobody supports", () => {
    const { errors } = validateQueuedFiles(
      [],
      [fakeFile("payload.exe", "application/x-msdownload")],
    );
    expect(errors[0]).toMatch(/not a supported file type/i);
  });
});
