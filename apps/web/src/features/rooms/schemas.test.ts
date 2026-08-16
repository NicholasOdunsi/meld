import { describe, expect, it } from "vitest";
import {
  AttachmentInputSchema,
  MAX_ATTACHMENT_BYTES,
  MessageInputSchema,
  ParticipantInputSchema,
} from "./schemas";

const uuid = "10000000-0000-4000-8000-000000000001";

describe("Room input schemas", () => {
  it("does not accept an author ID at the message boundary", () => {
    const parsed = MessageInputSchema.parse({
      roomId: uuid,
      clientId: "20000000-0000-4000-8000-000000000002",
      body: "  Research note  ",
      mentionedUserIds: [],
      mentionsProductAgent: false,
      authorId: "30000000-0000-4000-8000-000000000003",
    });

    expect(parsed.body).toBe("Research note");
    expect(parsed).not.toHaveProperty("authorId");
  });

  it("accepts a provider override and rejects an unknown provider", () => {
    expect(
      MessageInputSchema.parse({
        roomId: uuid,
        clientId: uuid,
        body: "Ask @Product Agent",
        mentionedUserIds: [],
        mentionsProductAgent: true,
        providerOverride: "claude",
      }),
    ).toMatchObject({ providerOverride: "claude" });

    // Omitting the override is valid: the task then resolves the saved default.
    expect(
      MessageInputSchema.parse({
        roomId: uuid,
        clientId: uuid,
        body: "Ask @Product Agent",
        mentionedUserIds: [],
        mentionsProductAgent: true,
      }),
    ).not.toHaveProperty("providerOverride");

    expect(() =>
      MessageInputSchema.parse({
        roomId: uuid,
        clientId: uuid,
        body: "Ask @Product Agent",
        mentionedUserIds: [],
        mentionsProductAgent: true,
        providerOverride: "gemini",
      }),
    ).toThrow();
  });

  it("limits mentions and validates participant access", () => {
    expect(() =>
      MessageInputSchema.parse({
        roomId: uuid,
        clientId: uuid,
        body: "Research note",
        mentionedUserIds: Array.from({ length: 21 }, () => uuid),
        mentionsProductAgent: false,
      }),
    ).toThrow();
    expect(
      ParticipantInputSchema.parse({
        roomId: uuid,
        userId: uuid,
        access: "edit",
      }),
    ).toMatchObject({ access: "edit" });
  });

  it("requires image captions and constrains upload metadata", () => {
    expect(() =>
      AttachmentInputSchema.parse({
        roomId: uuid,
        fileName: "prototype.png",
        mimeType: "image/png",
        size: 200,
        caption: "",
      }),
    ).toThrow("caption");
    expect(
      AttachmentInputSchema.parse({
        roomId: uuid,
        fileName: "research.md",
        mimeType: "text/markdown",
        size: 200,
      }),
    ).toMatchObject({ mimeType: "text/markdown" });
    expect(() =>
      AttachmentInputSchema.parse({
        roomId: uuid,
        fileName: "too-large.md",
        mimeType: "text/markdown",
        size: MAX_ATTACHMENT_BYTES + 1,
      }),
    ).toThrow();
    expect(
      AttachmentInputSchema.parse({
        roomId: uuid,
        fileName: "exact-limit.md",
        mimeType: "text/markdown",
        size: MAX_ATTACHMENT_BYTES,
      }),
    ).toMatchObject({ size: 10 * 1024 * 1024 });
  });
});
