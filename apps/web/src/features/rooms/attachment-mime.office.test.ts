import { describe, expect, it } from "vitest";
import {
  ACCEPTED_ATTACHMENT_FILE_TYPES,
  DOCX_MIME_TYPE,
  PPTX_MIME_TYPE,
  resolveMimeType,
} from "./attachment-mime";

describe("Office attachments", () => {
  it("offers .docx and .pptx in the file picker", () => {
    expect(ACCEPTED_ATTACHMENT_FILE_TYPES).toContain(".docx");
    expect(ACCEPTED_ATTACHMENT_FILE_TYPES).toContain(".pptx");
  });

  it("does not offer the macro-enabled variants", () => {
    // .docm/.pptm exist to carry VBA. Nothing here executes them, but there is
    // no reason to accept a container whose purpose is to hold code.
    expect(ACCEPTED_ATTACHMENT_FILE_TYPES).not.toContain(".docm");
    expect(ACCEPTED_ATTACHMENT_FILE_TYPES).not.toContain(".pptm");
  });

  it("recovers the Office type when the browser sends a generic one", () => {
    expect(resolveMimeType("plan.docx", "")).toBe(DOCX_MIME_TYPE);
    expect(resolveMimeType("deck.pptx", "application/octet-stream")).toBe(
      PPTX_MIME_TYPE,
    );
  });

  it("does not map the macro-enabled extensions to anything", () => {
    expect(resolveMimeType("macro.docm", "")).toBe("");
    expect(resolveMimeType("macro.pptm", "")).toBe("");
  });
});
