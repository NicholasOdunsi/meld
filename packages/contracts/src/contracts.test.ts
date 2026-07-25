import { describe, expect, it } from "vitest";
import {
  AIContextPackageSchema,
  AITaskSchema,
  DeviceToServerMessageSchema,
  PRDDocumentSchema,
  ProviderSchema,
  ServerToDeviceMessageSchema,
} from "./index";

describe("shared contracts", () => {
  it("rejects only the missing initiating user in an otherwise valid context", () => {
    const result = AIContextPackageSchema.safeParse({
      taskId: crypto.randomUUID(),
      organizationId: crypto.randomUUID(),
      roomId: crypto.randomUUID(),
      kind: "prd_generate",
      instruction: "Draft the PRD",
      messages: [],
      attachments: [],
      currentPrd: null,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected a missing initiating user to be rejected");
    }
    expect(result.error.issues.map((issue) => issue.path)).toEqual([
      ["initiatingUserId"],
    ]);
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

  it("parses supported providers", () => {
    expect(ProviderSchema.parse("claude")).toBe("claude");
  });

  it("parses a task available message", () => {
    expect(
      ServerToDeviceMessageSchema.parse({
        type: "task.available",
        taskId: crypto.randomUUID(),
      }).type,
    ).toBe("task.available");
  });

  it("parses a device heartbeat", () => {
    expect(
      DeviceToServerMessageSchema.parse({
        type: "heartbeat",
        connectorVersion: "1.0.0",
      }).type,
    ).toBe("heartbeat");
  });
});
