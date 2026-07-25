import { describe, expect, it } from "vitest";
import {
  AIContextPackageSchema,
  AITaskSchema,
  PRDDocumentSchema,
  ServerToDeviceMessageSchema,
} from "./index";

describe("shared contracts", () => {
  it("rejects a context package without an initiating user", () => {
    const result = AIContextPackageSchema.safeParse({
      taskId: crypto.randomUUID(),
      roomId: crypto.randomUUID(),
      kind: "prd_generate",
      instruction: "Draft the PRD",
      messages: [],
      attachments: [],
    });
    expect(result.success).toBe(false);
  });

  it("parses an AI task routing record", () => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    expect(
      AITaskSchema.parse({
        id,
        initiatingUserId: crypto.randomUUID(),
        organizationId: crypto.randomUUID(),
        roomId: crypto.randomUUID(),
        deviceId: crypto.randomUUID(),
        provider: "codex",
        kind: "room_reply",
        status: "queued",
        contextRevision: 0,
        createdAt: now,
        updatedAt: now,
      }).id,
    ).toBe(id);
  });

  it("requires every PRD section", () => {
    const result = PRDDocumentSchema.safeParse({ title: "Incomplete" });
    expect(result.success).toBe(false);
  });

  it("parses a task available message", () => {
    expect(
      ServerToDeviceMessageSchema.parse({
        type: "task.available",
        taskId: crypto.randomUUID(),
      }).type,
    ).toBe("task.available");
  });
});
