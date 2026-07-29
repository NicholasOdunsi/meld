import type { AIContextPackage, ProviderStatus } from "@meld/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  createTaskRepository,
  GatewayRepositoryError,
} from "./task-repository";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";

function createRpcMock(data: unknown = []) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  return {
    rpc,
    repository: createTaskRepository({ rpc } as never),
  };
}

describe("createTaskRepository", () => {
  it("maps claim and hydration arguments", async () => {
    const { repository, rpc } = createRpcMock();

    await repository.claimTask(TASK_ID, DEVICE_ID);
    await repository.hydrateAuthorizedRoomContext(TASK_ID, ATTEMPT_ID);

    expect(rpc).toHaveBeenNthCalledWith(1, "claim_ai_task", {
      target_task_id: TASK_ID,
      target_device_id: DEVICE_ID,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "hydrate_authorized_room_context",
      {
        target_task_id: TASK_ID,
        target_attempt_id: ATTEMPT_ID,
      },
    );
  });

  it("maps append, renew, settle, and cancellation arguments", async () => {
    const event = {
      type: "progress" as const,
      label: "Working",
      percent: 50,
    };
    const activeTasks = [{ taskId: TASK_ID, attemptId: ATTEMPT_ID }];
    const result = {
      kind: "room_reply" as const,
      payload: { text: "Done" },
      partial: false,
    };
    const { repository, rpc } = createRpcMock();

    await repository.appendTaskEvent({
      taskId: TASK_ID,
      deviceId: DEVICE_ID,
      attemptId: ATTEMPT_ID,
      sequence: 1,
      event,
    });
    await repository.renewTaskLeases(DEVICE_ID, activeTasks);
    await repository.settleTask({
      taskId: TASK_ID,
      deviceId: DEVICE_ID,
      attemptId: ATTEMPT_ID,
      operation: "complete",
      code: null,
      message: null,
      result,
      partial: false,
    });
    await repository.acknowledgeTaskCancellation(
      TASK_ID,
      ATTEMPT_ID,
      DEVICE_ID,
    );

    expect(rpc).toHaveBeenNthCalledWith(1, "append_ai_task_event", {
      target_task_id: TASK_ID,
      target_device_id: DEVICE_ID,
      target_attempt_id: ATTEMPT_ID,
      target_sequence: 1,
      target_type: "progress",
      target_payload: { label: "Working", percent: 50 },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "renew_ai_task_leases", {
      target_device_id: DEVICE_ID,
      target_attempts: activeTasks,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "settle_ai_task", {
      target_task_id: TASK_ID,
      target_device_id: DEVICE_ID,
      target_attempt_id: ATTEMPT_ID,
      target_operation: "complete",
      target_code: null,
      target_message: null,
      target_result: result,
      target_partial: false,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      4,
      "acknowledge_task_cancellation",
      {
        target_task_id: TASK_ID,
        target_attempt_id: ATTEMPT_ID,
        target_device_id: DEVICE_ID,
      },
    );
  });

  it("maps dispatch, reaping, authentication, connection, provider, and lease RPCs", async () => {
    const providerStatuses: ProviderStatus[] = [
      {
        provider: "codex",
        installation: "installed",
        version: "1.0.0",
        authentication: "authenticated",
        compatibility: "supported",
      },
    ];
    const { repository, rpc } = createRpcMock();

    await repository.listDispatchableTasks([DEVICE_ID]);
    await repository.reapExpiredTaskLeases();
    await repository.getExecutionDeviceForAuth(DEVICE_ID);
    await repository.recordDeviceConnection(DEVICE_ID, "connector/1.0");
    await repository.upsertProviderConnections(DEVICE_ID, providerStatuses);
    await repository.getAiTaskLeaseSeconds();

    expect(rpc).toHaveBeenNthCalledWith(1, "list_dispatchable_ai_tasks", {
      connected_device_ids: [DEVICE_ID],
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "reap_expired_ai_task_leases", {});
    expect(rpc).toHaveBeenNthCalledWith(3, "get_execution_device_for_auth", {
      target_device_id: DEVICE_ID,
    });
    expect(rpc).toHaveBeenNthCalledWith(4, "record_device_connection", {
      target_device_id: DEVICE_ID,
      target_connector_version: "connector/1.0",
    });
    expect(rpc).toHaveBeenNthCalledWith(5, "upsert_provider_connections", {
      target_device_id: DEVICE_ID,
      target_statuses: providerStatuses,
    });
    expect(rpc).toHaveBeenNthCalledWith(6, "get_ai_task_lease_seconds", {});
  });

  it("returns JSON payloads and maps snake-case table rows", async () => {
    const context = {
      taskId: TASK_ID,
      initiatingUserId: "44444444-4444-4444-8444-444444444444",
      organizationId: "55555555-5555-4555-8555-555555555555",
      roomId: "66666666-6666-4666-8666-666666666666",
      kind: "room_reply",
      instruction: "Summarize",
      messages: [],
      attachments: [],
      evidence: [],
      decisions: [],
    } satisfies AIContextPackage;
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { status: "ready", context },
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: DEVICE_ID,
            user_id: "77777777-7777-4777-8777-777777777777",
            token_hash: "digest",
            status: "active",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            kind: "cancel",
            task_id: TASK_ID,
            device_id: DEVICE_ID,
            status: "cancelled",
            attempt_id: ATTEMPT_ID,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ task_id: TASK_ID, attempt_id: ATTEMPT_ID }],
        error: null,
      });
    const repository = createTaskRepository({ rpc } as never);

    await expect(
      repository.hydrateAuthorizedRoomContext(TASK_ID, ATTEMPT_ID),
    ).resolves.toEqual({ status: "ready", context });
    await expect(
      repository.getExecutionDeviceForAuth(DEVICE_ID),
    ).resolves.toEqual({
      id: DEVICE_ID,
      userId: "77777777-7777-4777-8777-777777777777",
      tokenHash: "digest",
      status: "active",
    });
    await expect(
      repository.listDispatchableTasks([DEVICE_ID]),
    ).resolves.toEqual([
      {
        kind: "cancel",
        taskId: TASK_ID,
        deviceId: DEVICE_ID,
        status: "cancelled",
        attemptId: ATTEMPT_ID,
      },
    ]);
    await expect(
      repository.renewTaskLeases(DEVICE_ID, [
        { taskId: TASK_ID, attemptId: ATTEMPT_ID },
      ]),
    ).resolves.toEqual([{ taskId: TASK_ID, attemptId: ATTEMPT_ID }]);
  });

  it("returns null when device authentication finds no row", async () => {
    const { repository } = createRpcMock([]);

    await expect(
      repository.getExecutionDeviceForAuth(DEVICE_ID),
    ).resolves.toBeNull();
  });

  it("returns the device status from connection recording", async () => {
    const { repository } = createRpcMock("revoked");

    await expect(
      repository.recordDeviceConnection(DEVICE_ID, "connector/1.0"),
    ).resolves.toBe("revoked");
  });

  it("returns typed RPC acknowledgements and reaped leases", async () => {
    const claimedTask = {
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      provider: "codex",
      kind: "room_reply",
      instruction: "Summarize",
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: claimedTask, error: null })
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: "completed", error: null })
      .mockResolvedValueOnce({ data: "cancelled", error: null })
      .mockResolvedValueOnce({
        data: [
          {
            task_id: TASK_ID,
            attempt_id: ATTEMPT_ID,
            outcome: "needs_review",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: 90, error: null });
    const repository = createTaskRepository({ rpc } as never);

    await expect(repository.claimTask(TASK_ID, DEVICE_ID)).resolves.toEqual(
      claimedTask,
    );
    await expect(
      repository.appendTaskEvent({
        taskId: TASK_ID,
        deviceId: DEVICE_ID,
        attemptId: ATTEMPT_ID,
        sequence: 1,
        event: { type: "progress", label: "Working" },
      }),
    ).resolves.toBe(1);
    await expect(
      repository.settleTask({
        taskId: TASK_ID,
        deviceId: DEVICE_ID,
        attemptId: ATTEMPT_ID,
        operation: "complete",
        code: null,
        message: null,
        result: {
          kind: "room_reply",
          payload: { text: "Done" },
          partial: false,
        },
        partial: false,
      }),
    ).resolves.toBe("completed");
    await expect(
      repository.acknowledgeTaskCancellation(
        TASK_ID,
        ATTEMPT_ID,
        DEVICE_ID,
      ),
    ).resolves.toBe("cancelled");
    await expect(repository.reapExpiredTaskLeases()).resolves.toEqual([
      {
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        outcome: "needs_review",
      },
    ]);
    await expect(repository.getAiTaskLeaseSeconds()).resolves.toBe(90);
  });

  it("maps provider setup dispatch, progress, and settlement RPCs", async () => {
    const providerStatus: ProviderStatus = {
      provider: "claude",
      installation: "installed",
      version: "2.0.0",
      authentication: "authenticated",
      compatibility: "supported",
    };
    const { repository, rpc } = createRpcMock();

    await repository.listDispatchableProviderSetups([DEVICE_ID]);
    await repository.recordProviderSetupProgress({
      requestId: TASK_ID,
      deviceId: DEVICE_ID,
      stage: "installing",
      message: "Installing runtime",
    });
    await repository.settleProviderSetup({
      requestId: TASK_ID,
      deviceId: DEVICE_ID,
      succeeded: true,
      status: providerStatus,
      code: null,
      message: null,
    });
    await repository.settleProviderSetup({
      requestId: TASK_ID,
      deviceId: DEVICE_ID,
      succeeded: false,
      status: null,
      code: "authentication_failed",
      message: "Sign-in failed",
    });

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "list_dispatchable_provider_setups",
      { connected_device_ids: [DEVICE_ID] },
    );
    expect(rpc).toHaveBeenNthCalledWith(2, "record_provider_setup_progress", {
      target_request_id: TASK_ID,
      target_device_id: DEVICE_ID,
      target_stage: "installing",
      target_message: "Installing runtime",
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "settle_provider_setup_request", {
      target_request_id: TASK_ID,
      target_device_id: DEVICE_ID,
      target_success: true,
      target_provider_status: providerStatus,
      target_error_code: null,
      target_error_message: null,
    });
    expect(rpc).toHaveBeenNthCalledWith(4, "settle_provider_setup_request", {
      target_request_id: TASK_ID,
      target_device_id: DEVICE_ID,
      target_success: false,
      target_provider_status: null,
      target_error_code: "authentication_failed",
      target_error_message: "Sign-in failed",
    });
  });

  it("maps dispatchable provider setup rows from snake_case", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [
        { request_id: TASK_ID, device_id: DEVICE_ID, provider: "claude" },
      ],
      error: null,
    });
    const repository = createTaskRepository({ rpc } as never);

    await expect(
      repository.listDispatchableProviderSetups([DEVICE_ID]),
    ).resolves.toEqual([
      { requestId: TASK_ID, deviceId: DEVICE_ID, provider: "claude" },
    ]);
  });

  it("wraps PostgREST failures without exposing the database message", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        details: "private details",
        hint: "private hint",
        message: "stale_ai_task_attempt",
      },
    });
    const repository = createTaskRepository({ rpc } as never);

    const error = await repository
      .claimTask(TASK_ID, DEVICE_ID)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GatewayRepositoryError);
    expect(error).toMatchObject({
      rpcName: "claim_ai_task",
      databaseCode: "P0001",
      databaseMessage: "stale_ai_task_attempt",
    });
    expect((error as Error).message).toBe("Gateway repository request failed");
    expect((error as Error).message).not.toContain("stale_ai_task_attempt");
  });
});
