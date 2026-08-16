import { describe, expect, it } from "vitest";
import {
  AIContextManifestSchema,
  AIContextPackageSchema,
  AIInstructionSchema,
  AIResultEnvelopeSchema,
  AITaskSchema,
  DeviceToServerMessageSchema,
  MAX_ACTIVE_TASKS,
  MAX_HYDRATED_CONTEXT_BYTES,
  MAX_INSTRUCTION_CHARS,
  MAX_MANIFEST_ATTACHMENTS,
  MAX_MANIFEST_DECISIONS,
  MAX_MANIFEST_EVIDENCE,
  MAX_MANIFEST_MESSAGES,
  MAX_RESULT_BYTES,
  MAX_WS_FRAME_BYTES,
  PRDDocumentSchema,
  ProviderSchema,
  ProviderSetupRejectionSchema,
  RoomReplyResultSchema,
  ServerToDeviceMessageSchema,
  TaskEventSchema,
  AITaskKindSchema,
} from "./index";

const uuid = () => crypto.randomUUID();

const contextPackage = () => ({
  taskId: uuid(),
  initiatingUserId: uuid(),
  workspaceId: uuid(),
  roomId: uuid(),
  kind: "room_reply" as const,
  agentKind: "product" as const,
  researchScope: "room" as const,
  instruction: "Summarize the room",
  messages: [],
  attachments: [],
  evidence: [],
  decisions: [],
});

const providerStatus = () => ({
  provider: "codex" as const,
  installation: "installed" as const,
  version: "1.0.0",
  authentication: "authenticated" as const,
  compatibility: "supported" as const,
});

describe("shared contracts", () => {
  it("shares the user flow generation task kind", () => {
    expect(AITaskKindSchema.parse("user_flow_generate")).toBe("user_flow_generate");
  });
  it("shares trimmed instruction boundaries with hydrated context", () => {
    const maximum = "x".repeat(MAX_INSTRUCTION_CHARS);
    const oversized = "x".repeat(MAX_INSTRUCTION_CHARS + 1);

    expect(AIInstructionSchema.parse("x")).toBe("x");
    expect(AIInstructionSchema.parse(`  ${maximum}  `)).toBe(maximum);
    expect(AIInstructionSchema.safeParse("   ").success).toBe(false);
    expect(AIInstructionSchema.safeParse(oversized).success).toBe(false);

    expect(
      AIContextPackageSchema.parse({
        ...contextPackage(),
        instruction: "x",
      }).instruction,
    ).toBe("x");
    expect(
      AIContextPackageSchema.parse({
        ...contextPackage(),
        instruction: "  Summarize the room  ",
      }).instruction,
    ).toBe("Summarize the room");
    expect(
      AIContextPackageSchema.safeParse({
        ...contextPackage(),
        instruction: "   ",
      }).success,
    ).toBe(false);
    expect(
      AIContextPackageSchema.safeParse({
        ...contextPackage(),
        instruction: `  ${maximum}  `,
      }).success,
    ).toBe(true);
    expect(
      AIContextPackageSchema.safeParse({
        ...contextPackage(),
        instruction: oversized,
      }).success,
    ).toBe(false);
  });

  it("rejects only the missing initiating user in an otherwise valid context", () => {
    const result = AIContextPackageSchema.safeParse({
      taskId: uuid(),
      workspaceId: uuid(),
      roomId: uuid(),
      kind: "prd_generate",
      instruction: "Draft the PRD",
      messages: [],
      attachments: [],
      evidence: [],
      decisions: [],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected a missing initiating user to be rejected");
    }
    expect(result.error.issues.map((issue) => issue.path)).toEqual([
      ["initiatingUserId"],
    ]);
  });

  it("parses bounded evidence and decisions without PRD placeholders", () => {
    const context = AIContextPackageSchema.parse({
      ...contextPackage(),
      evidence: [{ id: uuid(), title: "Interview", note: "Observed friction" }],
      decisions: [
        { id: uuid(), summary: "Ship the fix", sourceMessageId: null },
      ],
    });

    expect(context).not.toHaveProperty("currentPrd");
  });

  it.each([
    ["messageIds", MAX_MANIFEST_MESSAGES],
    ["attachmentIds", MAX_MANIFEST_ATTACHMENTS],
    ["evidenceIds", MAX_MANIFEST_EVIDENCE],
    ["decisionIds", MAX_MANIFEST_DECISIONS],
  ] as const)("rejects a manifest above the %s ceiling", (field, maximum) => {
    expect(
      AIContextManifestSchema.safeParse({
        messageIds: [],
        attachmentIds: [],
        evidenceIds: [],
        decisionIds: [],
        [field]: Array.from({ length: maximum + 1 }, uuid),
      }).success,
    ).toBe(false);
  });

  it.each([
    ["messages", MAX_MANIFEST_MESSAGES, () => ({
      id: uuid(),
      authorName: "Ada",
      text: "Hello",
      createdAt: new Date().toISOString(),
    })],
    ["attachments", MAX_MANIFEST_ATTACHMENTS, () => ({
      id: uuid(),
      name: "notes.txt",
      mimeType: "text/plain",
      extractedText: null,
      userCaption: null,
    })],
    ["evidence", MAX_MANIFEST_EVIDENCE, () => ({
      id: uuid(),
      title: "Interview",
      note: null,
    })],
    ["decisions", MAX_MANIFEST_DECISIONS, () => ({
      id: uuid(),
      summary: "Ship it",
      sourceMessageId: null,
    })],
  ] as const)(
    "rejects hydrated context above the %s ceiling",
    (field, maximum, item) => {
      expect(
        AIContextPackageSchema.safeParse({
          ...contextPackage(),
          [field]: Array.from({ length: maximum + 1 }, () => item()),
        }).success,
      ).toBe(false);
    },
  );

  it("rejects oversized instructions and serialized hydrated context", () => {
    expect(
      AIContextPackageSchema.safeParse({
        ...contextPackage(),
        instruction: "x".repeat(20_001),
      }).success,
    ).toBe(false);

    expect(
      AIContextPackageSchema.safeParse({
        ...contextPackage(),
        messages: [
          {
            id: uuid(),
            authorName: "Ada",
            text: "x".repeat(MAX_HYDRATED_CONTEXT_BYTES),
            createdAt: new Date().toISOString(),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a serialized result above 256 KiB", () => {
    expect(
      AIResultEnvelopeSchema.safeParse({
        kind: "room_reply",
        payload: "x".repeat(MAX_RESULT_BYTES),
      }).success,
    ).toBe(false);
  });

  it("parses an AI task routing record", () => {
    const id = uuid();
    const now = new Date().toISOString();

    expect(
      AITaskSchema.parse({
        id,
        initiatingUserId: uuid(),
        workspaceId: uuid(),
        roomId: uuid(),
        deviceId: uuid(),
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
        taskId: uuid(),
      }).type,
    ).toBe("task.available");
  });

  it("parses every server-to-device protocol frame", () => {
    const taskId = uuid();
    const attemptId = uuid();
    const frames = [
      { type: "session.accepted", heartbeatSeconds: 30 },
      {
        type: "heartbeat.ack",
        renewedTasks: [{ taskId, attemptId }],
      },
      { type: "task.available", taskId },
      {
        type: "task.payload",
        taskId,
        attemptId,
        provider: "codex",
        context: contextPackage(),
      },
      { type: "task.cancel", taskId, attemptId },
      { type: "task.event_ack", taskId, attemptId, sequence: 1 },
      { type: "task.claim_rejected", taskId, reason: "claim_lost" },
      {
        type: "task.operation_rejected",
        taskId,
        attemptId,
        operation: "event",
        reason: "stale_ai_task_attempt",
      },
      {
        type: "task.terminal_ack",
        taskId,
        attemptId,
        status: "completed",
      },
      {
        type: "provider.setup",
        requestId: uuid(),
        provider: "codex",
      },
      {
        type: "provider.setup.rejected",
        requestId: uuid(),
        reason: "invalid_provider_setup_progress",
      },
    ];

    for (const frame of frames) {
      expect(ServerToDeviceMessageSchema.parse(frame)).toEqual(frame);
    }
  });

  it("accepts every provider setup rejection reason and no others", () => {
    for (const reason of ProviderSetupRejectionSchema.options) {
      expect(
        ServerToDeviceMessageSchema.parse({
          type: "provider.setup.rejected",
          requestId: uuid(),
          reason,
        }),
      ).toMatchObject({ reason });
    }

    expect(
      ServerToDeviceMessageSchema.safeParse({
        type: "provider.setup.rejected",
        requestId: uuid(),
        reason: "provider_setup_exploded",
      }).success,
    ).toBe(false);
    expect(
      ServerToDeviceMessageSchema.safeParse({
        type: "provider.setup.rejected",
        requestId: "not-a-uuid",
        reason: "invalid_provider_setup_progress",
      }).success,
    ).toBe(false);
  });

  it("parses every device-to-server protocol frame", () => {
    const taskId = uuid();
    const attemptId = uuid();
    const frames = [
      {
        type: "heartbeat",
        connectorVersion: "1.0.0",
        activeTasks: [{ taskId, attemptId }],
      },
      { type: "provider.status", providers: [] },
      { type: "task.claim", taskId },
      {
        type: "task.event",
        taskId,
        attemptId,
        sequence: 1,
        event: { type: "progress", label: "Starting" },
      },
      {
        type: "task.complete",
        taskId,
        attemptId,
        result: {
          kind: "room_reply",
          payload: { text: "Done" },
          partial: false,
        },
      },
      {
        type: "task.fail",
        taskId,
        attemptId,
        code: "execution_abandoned",
        message: "Connector stopped",
      },
      { type: "task.cancelled", taskId, attemptId },
      {
        type: "provider.setup.progress",
        requestId: uuid(),
        provider: "codex",
        stage: "installing",
        message: "Installing the Codex CLI.",
      },
      {
        type: "provider.setup.complete",
        requestId: uuid(),
        provider: "codex",
        status: providerStatus(),
      },
      {
        type: "provider.setup.failed",
        requestId: uuid(),
        provider: "codex",
        code: "authentication_failed",
        message: "Codex login did not complete.",
      },
    ];

    for (const frame of frames) {
      expect(DeviceToServerMessageSchema.parse(frame)).toEqual(frame);
    }
  });

  it("rejects server and device frames above 1 MiB", () => {
    const oversizedServerFrame = {
      type: "task.available",
      taskId: uuid(),
      padding: "x".repeat(MAX_WS_FRAME_BYTES),
    };
    const oversizedDeviceFrame = {
      type: "provider.status",
      providers: [
        {
          ...providerStatus(),
          version: "x".repeat(MAX_WS_FRAME_BYTES),
        },
      ],
    };

    expect(
      new TextEncoder().encode(JSON.stringify(oversizedServerFrame)).byteLength,
    ).toBeGreaterThan(MAX_WS_FRAME_BYTES);
    expect(
      new TextEncoder().encode(JSON.stringify(oversizedDeviceFrame)).byteLength,
    ).toBeGreaterThan(MAX_WS_FRAME_BYTES);
    expect(
      ServerToDeviceMessageSchema.safeParse(oversizedServerFrame).success,
    ).toBe(false);
    expect(
      DeviceToServerMessageSchema.safeParse(oversizedDeviceFrame).success,
    ).toBe(false);
  });

  it("bounds connector versions to 100 characters", () => {
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "heartbeat",
        connectorVersion: "x".repeat(100),
        activeTasks: [],
      }).success,
    ).toBe(true);
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "heartbeat",
        connectorVersion: "x".repeat(101),
        activeTasks: [],
      }).success,
    ).toBe(false);
  });

  it("bounds provider statuses to the supported provider count", () => {
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.status",
        providers: ProviderSchema.options.map((provider) => ({
          ...providerStatus(),
          provider,
        })),
      }).success,
    ).toBe(true);
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.status",
        providers: Array.from(
          { length: ProviderSchema.options.length + 1 },
          providerStatus,
        ),
      }).success,
    ).toBe(false);
  });

  it("requires attempt identity on every attempt-scoped frame", () => {
    const taskId = uuid();
    const serverFrames = [
      {
        type: "task.payload",
        taskId,
        provider: "codex",
        context: contextPackage(),
      },
      { type: "task.cancel", taskId },
      { type: "task.event_ack", taskId, sequence: 1 },
      {
        type: "task.operation_rejected",
        taskId,
        operation: "event",
        reason: "stale_ai_task_attempt",
      },
      { type: "task.terminal_ack", taskId, status: "completed" },
    ];
    const deviceFrames = [
      {
        type: "task.event",
        taskId,
        sequence: 1,
        event: { type: "progress", label: "Starting" },
      },
      {
        type: "task.complete",
        taskId,
        result: { kind: "room_reply", payload: null },
      },
      {
        type: "task.fail",
        taskId,
        code: "unknown",
        message: "Failed",
      },
      { type: "task.cancelled", taskId },
    ];

    for (const frame of serverFrames) {
      expect(ServerToDeviceMessageSchema.safeParse(frame).success).toBe(false);
    }
    for (const frame of deviceFrames) {
      expect(DeviceToServerMessageSchema.safeParse(frame).success).toBe(false);
    }
  });

  it("returns the exact leases renewed by a heartbeat", () => {
    const lease = { taskId: uuid(), attemptId: uuid() };
    expect(
      ServerToDeviceMessageSchema.parse({
        type: "heartbeat.ack",
        renewedTasks: [lease],
      }),
    ).toEqual({ type: "heartbeat.ack", renewedTasks: [lease] });
  });

  it("bounds heartbeat active task leases", () => {
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "heartbeat",
        connectorVersion: "1.0.0",
      }).success,
    ).toBe(false);

    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "heartbeat",
        connectorVersion: "1.0.0",
        activeTasks: Array.from({ length: MAX_ACTIVE_TASKS + 1 }, () => ({
          taskId: uuid(),
          attemptId: uuid(),
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects unbounded and unknown task events", () => {
    expect(
      TaskEventSchema.safeParse({
        type: "text.delta",
        text: "x".repeat(10_001),
      }).success,
    ).toBe(false);
    expect(
      TaskEventSchema.safeParse({
        type: "tool.call",
        command: "cat ~/.ssh/id_rsa",
      }).success,
    ).toBe(false);
  });

  it("parses bounded progress, text, and notice task events", () => {
    expect(
      TaskEventSchema.parse({
        type: "progress",
        label: "Halfway",
        percent: 50,
      }),
    ).toEqual({ type: "progress", label: "Halfway", percent: 50 });
    expect(
      TaskEventSchema.parse({ type: "text.delta", text: "Draft" }),
    ).toEqual({ type: "text.delta", text: "Draft" });
    expect(
      TaskEventSchema.parse({
        type: "notice",
        code: "permission_changed",
        message: "Access changed",
      }),
    ).toEqual({
      type: "notice",
      code: "permission_changed",
      message: "Access changed",
    });
  });

  it("parses a bounded device heartbeat", () => {
    expect(
      DeviceToServerMessageSchema.parse({
        type: "heartbeat",
        connectorVersion: "1.0.0",
        activeTasks: [],
      }).type,
    ).toBe("heartbeat");
  });

  it("parses a valid room reply result", () => {
    const MESSAGE_ID = uuid();
    const EVIDENCE_ID = uuid();

    expect(
      RoomReplyResultSchema.parse({
        response: "The current evidence supports a narrower onboarding test.",
        citedMessageIds: [MESSAGE_ID],
        citedEvidenceIds: [EVIDENCE_ID],
        assumptions: ["The interviewed users represent the beta cohort."],
        suggestedNextQuestions: ["Which role owns setup completion?"],
      }),
    ).toMatchObject({ citedMessageIds: [MESSAGE_ID] });
  });

  it("rejects empty response text in room reply result", () => {
    expect(() =>
      RoomReplyResultSchema.parse({
        response: "",
        citedMessageIds: [],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: [],
      }),
    ).toThrow();
  });

  it("accepts a response at the persisted message body length limit", () => {
    expect(
      RoomReplyResultSchema.safeParse({
        response: "x".repeat(20_000),
        citedMessageIds: [],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: [],
      }).success,
    ).toBe(true);
  });

  it("rejects a response exceeding the persisted message body length limit", () => {
    expect(
      RoomReplyResultSchema.safeParse({
        response: "x".repeat(20_001),
        citedMessageIds: [],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: [],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 5 suggested next questions", () => {
    expect(
      RoomReplyResultSchema.safeParse({
        response: "Response",
        citedMessageIds: [],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: Array.from({ length: 6 }, (_, i) => `Question ${i + 1}`),
      }).success,
    ).toBe(false);
  });

  it("rejects non-UUID citations in room reply result", () => {
    expect(
      RoomReplyResultSchema.safeParse({
        response: "Response",
        citedMessageIds: ["not-a-uuid"],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: [],
      }).success,
    ).toBe(false);
    expect(
      RoomReplyResultSchema.safeParse({
        response: "Response",
        citedMessageIds: [],
        citedEvidenceIds: ["also-not-a-uuid"],
        assumptions: [],
        suggestedNextQuestions: [],
      }).success,
    ).toBe(false);
  });

  it("parses provider setup message from server to device", () => {
    const REQUEST_ID = uuid();

    expect(
      ServerToDeviceMessageSchema.parse({
        type: "provider.setup",
        requestId: REQUEST_ID,
        provider: "codex",
      }),
    ).toMatchObject({ type: "provider.setup", provider: "codex" });
  });

  it("parses provider setup progress message from device to server", () => {
    const REQUEST_ID = uuid();

    expect(
      DeviceToServerMessageSchema.parse({
        type: "provider.setup.progress",
        requestId: REQUEST_ID,
        provider: "codex",
        stage: "authenticating",
        message: "Waiting for Codex login.",
      }),
    ).toMatchObject({ type: "provider.setup.progress", stage: "authenticating" });
  });

  it("rejects provider setup messages with unknown stages", () => {
    const REQUEST_ID = uuid();

    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.setup.progress",
        requestId: REQUEST_ID,
        provider: "codex",
        stage: "unknown_stage",
        message: "Message",
      }).success,
    ).toBe(false);
  });

  it("parses provider setup complete message from device to server", () => {
    const REQUEST_ID = uuid();

    expect(
      DeviceToServerMessageSchema.parse({
        type: "provider.setup.complete",
        requestId: REQUEST_ID,
        provider: "codex",
        status: providerStatus(),
      }),
    ).toMatchObject({
      type: "provider.setup.complete",
      requestId: REQUEST_ID,
      status: { provider: "codex", installation: "installed" },
    });
  });

  it("rejects provider setup complete messages with a malformed provider status", () => {
    const REQUEST_ID = uuid();

    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.setup.complete",
        requestId: REQUEST_ID,
        provider: "codex",
      }).success,
    ).toBe(false);
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.setup.complete",
        requestId: REQUEST_ID,
        provider: "codex",
        status: { ...providerStatus(), installation: "not_a_state" },
      }).success,
    ).toBe(false);
  });

  it("parses provider setup failed message from device to server", () => {
    const REQUEST_ID = uuid();

    expect(
      DeviceToServerMessageSchema.parse({
        type: "provider.setup.failed",
        requestId: REQUEST_ID,
        provider: "codex",
        code: "authentication_failed",
        message: "Codex login did not complete.",
      }),
    ).toMatchObject({
      type: "provider.setup.failed",
      requestId: REQUEST_ID,
      code: "authentication_failed",
    });
  });

  it("rejects provider setup failed messages with an unknown error code", () => {
    const REQUEST_ID = uuid();

    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.setup.failed",
        requestId: REQUEST_ID,
        provider: "codex",
        code: "not_a_setup_error_code",
        message: "Setup failed.",
      }).success,
    ).toBe(false);
  });

  it.each(["provider.setup.progress", "provider.setup.failed"] as const)(
    "bounds %s messages to 500 characters",
    (type) => {
      const REQUEST_ID = uuid();
      const frame = (message: string) =>
        type === "provider.setup.progress"
          ? {
              type,
              requestId: REQUEST_ID,
              provider: "codex",
              stage: "authenticating",
              message,
            }
          : {
              type,
              requestId: REQUEST_ID,
              provider: "codex",
              code: "authentication_failed",
              message,
            };

      expect(
        DeviceToServerMessageSchema.safeParse(frame("x".repeat(500))).success,
      ).toBe(true);
      expect(
        DeviceToServerMessageSchema.safeParse(frame("x".repeat(501))).success,
      ).toBe(false);
    },
  );

  it("rejects unsupported provider values on every provider setup frame", () => {
    const REQUEST_ID = uuid();

    expect(
      ServerToDeviceMessageSchema.safeParse({
        type: "provider.setup",
        requestId: REQUEST_ID,
        provider: "gemini",
      }).success,
    ).toBe(false);
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.setup.progress",
        requestId: REQUEST_ID,
        provider: "gemini",
        stage: "authenticating",
        message: "Message",
      }).success,
    ).toBe(false);
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.setup.complete",
        requestId: REQUEST_ID,
        provider: "gemini",
        status: providerStatus(),
      }).success,
    ).toBe(false);
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.setup.failed",
        requestId: REQUEST_ID,
        provider: "gemini",
        code: "authentication_failed",
        message: "Setup failed.",
      }).success,
    ).toBe(false);
  });

  it("rejects provider setup messages with malformed request IDs", () => {
    expect(
      ServerToDeviceMessageSchema.safeParse({
        type: "provider.setup",
        requestId: "not-a-uuid",
        provider: "codex",
      }).success,
    ).toBe(false);
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.setup.progress",
        requestId: "not-a-uuid",
        provider: "codex",
        stage: "authenticating",
        message: "Message",
      }).success,
    ).toBe(false);
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.setup.complete",
        requestId: "not-a-uuid",
        provider: "codex",
        status: providerStatus(),
      }).success,
    ).toBe(false);
    expect(
      DeviceToServerMessageSchema.safeParse({
        type: "provider.setup.failed",
        requestId: "not-a-uuid",
        provider: "codex",
        code: "authentication_failed",
        message: "Setup failed.",
      }).success,
    ).toBe(false);
  });
});
