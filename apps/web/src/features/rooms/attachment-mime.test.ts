import { describe, expect, it } from "vitest";
import {
  ACCEPTED_ATTACHMENT_FILE_TYPES,
  resolveMimeType,
} from "./attachment-mime";

describe("resolveMimeType", () => {
  it("keeps a specific declared MIME type", () => {
    expect(resolveMimeType("brief.pdf", "application/pdf")).toBe(
      "application/pdf",
    );
  });

  it("derives from the extension when the browser sends nothing", () => {
    expect(resolveMimeType("notes.md", "")).toBe("text/markdown");
    expect(resolveMimeType("data.csv", "")).toBe("text/csv");
    expect(resolveMimeType("config.yaml", "")).toBe("text/yaml");
  });

  it("derives from the extension for the generic octet-stream type", () => {
    expect(
      resolveMimeType("data.json", "application/octet-stream"),
    ).toBe("application/json");
  });

  it("returns the declared type when the extension is unknown", () => {
    expect(resolveMimeType("mystery.bin", "")).toBe("");
  });

  it("lists the broadened accepted types", () => {
    expect(ACCEPTED_ATTACHMENT_FILE_TYPES).toContain(".html");
    expect(ACCEPTED_ATTACHMENT_FILE_TYPES).toContain(".csv");
    expect(ACCEPTED_ATTACHMENT_FILE_TYPES).toContain("image/png");
  });
});
