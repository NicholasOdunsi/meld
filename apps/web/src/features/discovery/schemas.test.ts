import { describe, expect, it } from "vitest";
import {
  AttachmentInputSchema,
  MessageInputSchema,
  ParticipantInputSchema,
} from "./schemas";

const uuid = "10000000-0000-4000-8000-000000000001";

describe("Discovery input schemas", () => {
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
  });
});
