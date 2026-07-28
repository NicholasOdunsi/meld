import type { AIContextPackage, ProviderStatus } from "@meld/contracts";
import { WebSocket, type RawData } from "ws";
import { describe, expect, it, vi } from "vitest";
import {
  GatewayRepositoryError,
  type TaskRepository,
} from "../tasks/task-repository";
import { DeviceSession, type DeviceSocket } from "./device-session";
import { createProtocolHandler } from "./protocol-handler";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const ORGANIZATION_ID = "55555555-5555-4555-8555-555555555555";
const ROOM_ID = "66666666-6666-4666-8666-666666666666";

const CONTEXT = {
  taskId: TASK_ID,
  initiatingUserId: USER_ID,
  organizationId: ORGANIZATION_ID,
  roomId: ROOM_ID,
  kind: "room_reply",
  instruction: "Summarize the room",
  messages: [],
  attachments: [],
  evidence: [],
  decisions: [],
} satisfies AIContextPackage;

function createRepository() {
  return {
    claimTask: vi.fn().mockResolvedValue({
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      provider: "codex",
      kind: "room_reply",
      instruction: CONTEXT.instruction,
    }),
    hydrateAuthorizedRoomContext: vi.fn().mockResolvedValue({
      status: "ready",
      context: CONTEXT,
    }),
    appendTaskEvent: vi.fn().mockResolvedValue(1),
    renewTaskLeases: vi
      .fn()
      .mockResolvedValue([{ taskId: TASK_ID, attemptId: ATTEMPT_ID }]),
    settleTask: vi.fn().mockResolvedValue("completed"),
    acknowledgeTaskCancellation: vi.fn().mockResolvedValue("cancelled"),
    recordDeviceConnection: vi.fn().mockResolvedValue(undefined),
    upsertProviderConnections: vi.fn().mockResolvedValue(undefined),
  } as unknown as TaskRepository;
}

function createHarness(repository = createRepository()) {
  const send = vi.fn<(data: string) => void>();
  const close = vi.fn<(code?: number, reason?: string) => void>();
  const socket: DeviceSocket = {
    readyState: WebSocket.OPEN,
    send,
    close,
  };
  const session = new DeviceSession(
    { id: DEVICE_ID, userId: USER_ID },
    socket,
  );
  const handler = createProtocolHandler({ repository });

  return {
    repository,
    session,
    send,
    close,
    handler,
    messages() {
      return send.mock.calls.map(([message]) => JSON.parse(message) as unknown);
    },
  };
}

function textFrame(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value));
}

function repositoryError(message: string): GatewayRepositoryError {
  return new GatewayRepositoryError(
    "gateway_test_rpc",
    {
      code: "P0001",
      details: "",
      hint: "",
      message,
    } as never,
  );
}

describe("createProtocolHandler validation", () => {
  it.each([
    ["invalid JSON", Buffer.from("{") as RawData],
    [
      "binary data",
      new TextEncoder().encode('{"type":"heartbeat"}').buffer as RawData,
    ],
    ["an unknown type", textFrame({ type: "task.unknown" })],
    [
      "a task event missing its attempt id",
      textFrame({
        type: "task.event",
        taskId: TASK_ID,
        sequence: 1,
        event: { type: "progress", label: "Working" },
      }),
    ],
    [
      "a completion missing its attempt id",
      textFrame({
        type: "task.complete",
        taskId: TASK_ID,
        result: {
          kind: "room_reply",
          payload: { text: "Done" },
          partial: false,
        },
      }),
    ],
    [
      "a failure missing its attempt id",
      textFrame({
        type: "task.fail",
        taskId: TASK_ID,
        code: "unknown",
        message: "Failed",
      }),
    ],
    [
      "a cancellation acknowledgement missing its attempt id",
      textFrame({ type: "task.cancelled", taskId: TASK_ID }),
    ],
    [
      "too many active leases",
      textFrame({
        type: "heartbeat",
        connectorVersion: "1.0.0",
        activeTasks: Array.from({ length: 33 }, () => ({
          taskId: TASK_ID,
          attemptId: ATTEMPT_ID,
        })),
      }),
    ],
    [
      "an unknown event type",
      textFrame({
        type: "task.event",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        sequence: 1,
        event: { type: "tool.call", command: "whoami" },
      }),
    ],
  ])("closes with policy violation for %s", async (_label, rawFrame) => {
    const harness = createHarness();

    await harness.handler.handle(harness.session, rawFrame);

    expect(harness.close).toHaveBeenCalledWith(
      1008,
      "Invalid device protocol frame",
    );
    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.repository.recordDeviceConnection).not.toHaveBeenCalled();
  });
});

describe("createProtocolHandler liveness routing", () => {
  it("records and acknowledges the exact heartbeat lease pairs", async () => {
    const harness = createHarness();
    const previousHeartbeat = harness.session.lastHeartbeatAt;

    await harness.handler.handle(
      harness.session,
      textFrame({
        type: "heartbeat",
        connectorVersion: "connector/1.2.3",
        activeTasks: [{ taskId: TASK_ID, attemptId: ATTEMPT_ID }],
      }),
    );

    expect(harness.session.lastHeartbeatAt).toBeGreaterThanOrEqual(
      previousHeartbeat,
    );
    expect(harness.repository.recordDeviceConnection).toHaveBeenCalledWith(
      DEVICE_ID,
      "connector/1.2.3",
    );
    expect(harness.repository.renewTaskLeases).toHaveBeenCalledWith(
      DEVICE_ID,
      [{ taskId: TASK_ID, attemptId: ATTEMPT_ID }],
    );
    expect(harness.messages()).toEqual([
      {
        type: "heartbeat.ack",
        renewedTasks: [{ taskId: TASK_ID, attemptId: ATTEMPT_ID }],
      },
    ]);
  });

  it("passes only schema-parsed provider fields to the repository", async () => {
    const harness = createHarness();
    const provider = {
      provider: "codex",
      installation: "installed",
      version: "1.2.3",
      authentication: "authenticated",
      compatibility: "supported",
    } satisfies ProviderStatus;

    await harness.handler.handle(
      harness.session,
      textFrame({
        type: "provider.status",
        providers: [
          {
            ...provider,
            executablePath: "/private/bin/codex",
            rawResponse: "secret",
          },
        ],
        ignoredTopLevelField: true,
      }),
    );

    expect(
      harness.repository.upsertProviderConnections,
    ).toHaveBeenCalledWith(DEVICE_ID, [provider]);
    expect(harness.send).not.toHaveBeenCalled();
  });
});

describe("createProtocolHandler task routing", () => {
  it("claims, hydrates, validates, and sends one task payload in order", async () => {
    const order: string[] = [];
    const repository = createRepository();
    vi.mocked(repository.claimTask).mockImplementation(async () => {
      order.push("claim");
      return {
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        provider: "codex",
        kind: "room_reply",
        instruction: CONTEXT.instruction,
      };
    });
    vi.mocked(repository.hydrateAuthorizedRoomContext).mockImplementation(
      async () => {
        order.push("hydrate");
        return {
          status: "ready",
          context: {
            ...CONTEXT,
            untrustedDatabaseField: "discard me",
          },
        } as never;
      },
    );
    const harness = createHarness(repository);

    await harness.handler.handle(
      harness.session,
      textFrame({ type: "task.claim", taskId: TASK_ID }),
    );

    expect(order).toEqual(["claim", "hydrate"]);
    expect(repository.claimTask).toHaveBeenCalledWith(TASK_ID, DEVICE_ID);
    expect(repository.hydrateAuthorizedRoomContext).toHaveBeenCalledWith(
      TASK_ID,
      ATTEMPT_ID,
    );
    expect(harness.messages()).toEqual([
      {
        type: "task.payload",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        provider: "codex",
        context: CONTEXT,
      },
    ]);
  });

  it("maps a lost claim without attempting hydration", async () => {
    const repository = createRepository();
    vi.mocked(repository.claimTask).mockRejectedValue(
      repositoryError("ai_task_claim_rejected"),
    );
    const harness = createHarness(repository);

    await harness.handler.handle(
      harness.session,
      textFrame({ type: "task.claim", taskId: TASK_ID }),
    );

    expect(repository.hydrateAuthorizedRoomContext).not.toHaveBeenCalled();
    expect(harness.messages()).toEqual([
      {
        type: "task.claim_rejected",
        taskId: TASK_ID,
        reason: "claim_lost",
      },
    ]);
    expect(harness.close).not.toHaveBeenCalled();
  });

  it.each([
    [
      "revoked hydration",
      { status: "rejected", reason: "permission_changed" },
      "permission_changed",
    ],
    [
      "an explicit permission error",
      repositoryError("permission_changed"),
      "permission_changed",
    ],
    [
      "oversized hydrated context",
      {
        status: "rejected",
        reason: "context_too_large",
      },
      "context_too_large",
    ],
  ] as const)(
    "rejects a claim and emits no partial payload for %s",
    async (_label, hydrationOutcome, reason) => {
      const repository = createRepository();
      if (hydrationOutcome instanceof Error) {
        vi.mocked(
          repository.hydrateAuthorizedRoomContext,
        ).mockRejectedValue(hydrationOutcome);
      } else {
        vi.mocked(
          repository.hydrateAuthorizedRoomContext,
        ).mockResolvedValue(hydrationOutcome as never);
      }
      const harness = createHarness(repository);

      await harness.handler.handle(
        harness.session,
        textFrame({ type: "task.claim", taskId: TASK_ID }),
      );

      expect(harness.messages()).toEqual([
        {
          type: "task.claim_rejected",
          taskId: TASK_ID,
          reason,
        },
      ]);
      expect(harness.close).not.toHaveBeenCalled();
    },
  );

  it("fails closed when hydrated context is malformed but not oversized", async () => {
    const repository = createRepository();
    vi.mocked(
      repository.hydrateAuthorizedRoomContext,
    ).mockResolvedValue({
      status: "ready",
      context: { ...CONTEXT, taskId: "not-a-uuid" },
    } as never);
    const harness = createHarness(repository);

    await expect(
      harness.handler.handle(
        harness.session,
        textFrame({ type: "task.claim", taskId: TASK_ID }),
      ),
    ).rejects.toThrow("Invalid hydrated AI context");
    expect(harness.send).not.toHaveBeenCalled();
  });

  it("acknowledges exact event replay with attempt identity", async () => {
    const harness = createHarness();
    const event = { type: "progress", label: "Working", percent: 50 };

    await harness.handler.handle(
      harness.session,
      textFrame({
        type: "task.event",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        sequence: 1,
        event,
      }),
    );

    expect(harness.repository.appendTaskEvent).toHaveBeenCalledWith({
      taskId: TASK_ID,
      deviceId: DEVICE_ID,
      attemptId: ATTEMPT_ID,
      sequence: 1,
      event,
    });
    expect(harness.messages()).toEqual([
      {
        type: "task.event_ack",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        sequence: 1,
      },
    ]);
  });

  it.each([
    ["stale_ai_task_attempt", false],
    ["out_of_order_ai_task_event", true],
    ["conflicting_ai_task_event", true],
  ] as const)(
    "maps %s to an event rejection with the required close policy",
    async (reason, shouldClose) => {
      const repository = createRepository();
      vi.mocked(repository.appendTaskEvent).mockRejectedValue(
        repositoryError(reason),
      );
      const harness = createHarness(repository);

      await harness.handler.handle(
        harness.session,
        textFrame({
          type: "task.event",
          taskId: TASK_ID,
          attemptId: ATTEMPT_ID,
          sequence: 1,
          event: { type: "text.delta", text: "Draft" },
        }),
      );

      expect(harness.messages()).toEqual([
        {
          type: "task.operation_rejected",
          taskId: TASK_ID,
          attemptId: ATTEMPT_ID,
          operation: "event",
          reason,
        },
      ]);
      if (shouldClose) {
        expect(harness.close).toHaveBeenCalledWith(
          1008,
          "Invalid device protocol operation",
        );
      } else {
        expect(harness.close).not.toHaveBeenCalled();
      }
    },
  );

  it("settles completion and an identical retry with the same terminal ack", async () => {
    const harness = createHarness();
    const result = {
      kind: "room_reply",
      payload: { text: "Done" },
      partial: true,
    };
    const frame = textFrame({
      type: "task.complete",
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      result,
    });

    await harness.handler.handle(harness.session, frame);
    await harness.handler.handle(harness.session, frame);

    expect(harness.repository.settleTask).toHaveBeenCalledTimes(2);
    expect(harness.repository.settleTask).toHaveBeenCalledWith({
      taskId: TASK_ID,
      deviceId: DEVICE_ID,
      attemptId: ATTEMPT_ID,
      operation: "complete",
      code: null,
      message: null,
      result,
      partial: true,
    });
    expect(harness.messages()).toEqual([
      {
        type: "task.terminal_ack",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        status: "completed",
      },
      {
        type: "task.terminal_ack",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        status: "completed",
      },
    ]);
  });

  it("maps contradictory settlement retry to rejection and closes", async () => {
    const repository = createRepository();
    vi.mocked(repository.settleTask)
      .mockResolvedValueOnce("completed")
      .mockRejectedValueOnce(
        repositoryError("conflicting_ai_task_settlement"),
      );
    const harness = createHarness(repository);

    await harness.handler.handle(
      harness.session,
      textFrame({
        type: "task.complete",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        result: {
          kind: "room_reply",
          payload: { text: "First" },
          partial: false,
        },
      }),
    );
    await harness.handler.handle(
      harness.session,
      textFrame({
        type: "task.complete",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        result: {
          kind: "room_reply",
          payload: { text: "Different" },
          partial: false,
        },
      }),
    );

    expect(harness.messages().at(-1)).toEqual({
      type: "task.operation_rejected",
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      operation: "complete",
      reason: "conflicting_ai_task_settlement",
    });
    expect(harness.close).toHaveBeenCalledWith(
      1008,
      "Invalid device protocol operation",
    );
  });

  it("settles failure with error fields and a null result", async () => {
    const repository = createRepository();
    vi.mocked(repository.settleTask).mockResolvedValue(
      "needs_reauthentication",
    );
    const harness = createHarness(repository);

    await harness.handler.handle(
      harness.session,
      textFrame({
        type: "task.fail",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        code: "authentication_required",
        message: "Sign in again",
      }),
    );

    expect(repository.settleTask).toHaveBeenCalledWith({
      taskId: TASK_ID,
      deviceId: DEVICE_ID,
      attemptId: ATTEMPT_ID,
      operation: "fail",
      code: "authentication_required",
      message: "Sign in again",
      result: null,
      partial: false,
    });
    expect(harness.messages()).toEqual([
      {
        type: "task.terminal_ack",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        status: "needs_reauthentication",
      },
    ]);
  });

  it("acknowledges cancellation without settling it again", async () => {
    const harness = createHarness();

    await harness.handler.handle(
      harness.session,
      textFrame({
        type: "task.cancelled",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
      }),
    );

    expect(
      harness.repository.acknowledgeTaskCancellation,
    ).toHaveBeenCalledWith(TASK_ID, ATTEMPT_ID, DEVICE_ID);
    expect(harness.repository.settleTask).not.toHaveBeenCalled();
    expect(harness.messages()).toEqual([
      {
        type: "task.terminal_ack",
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        status: "cancelled",
      },
    ]);
  });
});
