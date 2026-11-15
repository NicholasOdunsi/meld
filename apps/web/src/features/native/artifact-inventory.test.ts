import { describe, expect, it } from "vitest";
import type { InspirationItemView } from "@meld/contracts";
import type { RoomDesignScreen } from "@/features/design/design-screen-generation";
import type { RoomPrd } from "@/features/prd/schemas";
import type { RoomMessage } from "@/features/rooms/repository";
import { buildArtifactInventory, linkArtifactsToStars } from "./artifact-inventory";
import type { StreamArtifact, StreamMessageRow, StreamStar } from "./bridge";

describe("buildArtifactInventory", () => {
  it("returns an empty list when the room has no artifacts", () => {
    expect(buildArtifactInventory({ basePath: "/w/rooms/r", prd: null, screens: [], inspiration: [], messages: [] })).toEqual([]);
  });

  it("lists durable records and excludes screens that have not been built", () => {
    const prd = { id: "p", version: 2, createdAt: "2026-11-15T09:00:00Z" } as RoomPrd;
    const screens = [
      { id: "s1", name: "Home", state: "built" },
      { id: "s2", name: "Draft", state: "empty" },
    ] as RoomDesignScreen[];
    const inspiration = [{ id: "i", note: "Layout", createdAt: "2026-11-15T10:00:00Z" }] as InspirationItemView[];
    const messages = [{ id: "m", createdAt: "2026-11-15T11:00:00Z", attachments: [
      { id: "f", originalName: "notes.pdf", viewUrl: "https://example.test/signed" },
    ] }] as RoomMessage[];
    expect(buildArtifactInventory({ basePath: "/w/rooms/r", prd, screens, inspiration, messages })).toEqual([
      { id: "prd:p", kind: "prd", title: "PRD · version 2", href: "/w/rooms/r?tab=prd", starId: null, createdAt: prd.createdAt },
      { id: "prototype", kind: "prototype", title: "Prototype", href: "/w/rooms/r?tab=prototype", starId: null, createdAt: null },
      { id: "screen:s1", kind: "screen", title: "Home", href: "/w/rooms/r?tab=prototype&screen=s1", starId: null, createdAt: null },
      { id: "inspiration:i", kind: "inspiration", title: "Layout", href: "/w/rooms/r?tab=inspiration", previewUrl: undefined,
        mimeType: undefined, starId: null, createdAt: inspiration[0].createdAt },
      { id: "file:f", kind: "file", title: "notes.pdf", href: "https://example.test/signed", starId: null,
        mimeType: undefined, sourceMessageId: "m", createdAt: messages[0].createdAt },
    ]);
  });

  it("links files from a request, follow-up, or Orion reply to their Star", () => {
    const stars = [{ id: "task", sourceMessageId: "request", followupMessageIds: ["followup"] }] as StreamStar[];
    const messages = [{ id: "reply", taskId: "task" }] as StreamMessageRow[];
    const artifacts = ["request", "followup", "reply", "unrelated"].map((id) => ({
      id, sourceMessageId: id, starId: null,
    })) as StreamArtifact[];
    expect(linkArtifactsToStars(artifacts, stars, messages).map((item) => item.starId))
      .toEqual(["task", "task", "task", null]);
  });
});
