import type {
  AIContextPackage,
  AgentKind,
  AIResultEnvelope,
  AITaskKind,
  AITaskStatus,
  ActiveTaskLease,
  Provider,
  ResearchScope,
  ProviderSetupErrorCode,
  ProviderSetupStage,
  ProviderStatus,
  TaskClaimRejection,
  TaskErrorCode,
  TaskEvent,
} from "@meld/contracts";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export interface AuthenticatedDevice {
  id: string;
  userId: string;
  tokenHash: string;
  status: "active" | "revoked";
}

export type ExecutionDeviceStatus = "active" | "revoked";

export interface ClaimedTask {
  taskId: string;
  attemptId: string;
  provider: Provider;
  model?: string | null;
  kind: AITaskKind;
  instruction: string;
  agentKind: AgentKind;
  researchScope: ResearchScope;
}

export type HydrationOutcome =
  | {
      status: "ready";
      context: AIContextPackage;
    }
  | {
      status: "rejected";
      reason: Extract<
        TaskClaimRejection,
        "permission_changed" | "context_too_large"
      >;
    };

export type DispatchableTask =
  | {
      kind: "available";
      taskId: string;
      deviceId: string;
      status: "ready_to_run";
      attemptId: null;
    }
  | {
      kind: "cancel";
      taskId: string;
      deviceId: string;
      status: "cancelled";
      attemptId: string;
    };

export type RenewedLease = ActiveTaskLease;

export type SettlementAck = AITaskStatus;

export interface ReapedTaskLease {
  taskId: string;
  attemptId: string;
  outcome: AITaskStatus;
}

export interface AppendTaskEventInput {
  taskId: string;
  deviceId: string;
  attemptId: string;
  sequence: number;
  event: TaskEvent;
}

export interface SettleTaskInput {
  taskId: string;
  deviceId: string;
  attemptId: string;
  operation: "complete" | "fail";
  code: TaskErrorCode | null;
  message: string | null;
  result: AIResultEnvelope | null;
  partial: boolean;
}

export type DispatchableProviderSetup = {
  requestId: string;
  deviceId: string;
  provider: Provider;
};

export interface RecordProviderSetupProgressInput {
  requestId: string;
  deviceId: string;
  stage: ProviderSetupStage;
  message: string;
}

export interface SettleProviderSetupInput {
  requestId: string;
  deviceId: string;
  succeeded: boolean;
  status: ProviderStatus | null;
  code: ProviderSetupErrorCode | null;
  message: string | null;
}

interface RenewedLeaseRow {
  task_id: string;
  attempt_id: string;
}

interface DispatchableTaskRow {
  kind: "available" | "cancel";
  task_id: string;
  device_id: string;
  status: AITaskStatus;
  attempt_id: string | null;
}

interface ReapedTaskLeaseRow {
  task_id: string;
  attempt_id: string;
  outcome: AITaskStatus;
}

interface AuthenticatedDeviceRow {
  id: string;
  user_id: string;
  token_hash: string;
  status: "active" | "revoked";
}

interface DispatchableProviderSetupRow {
  request_id: string;
  device_id: string;
  provider: Provider;
}

export class GatewayRepositoryError extends Error {
  readonly rpcName: string;
  readonly databaseCode: string;
  readonly databaseMessage: string;

  constructor(rpcName: string, error: PostgrestError) {
    super("Gateway repository request failed", { cause: error });
    this.name = "GatewayRepositoryError";
    this.rpcName = rpcName;
    this.databaseCode = error.code;
    this.databaseMessage = error.message;
  }
}

export function createTaskRepository(supabase: Pick<SupabaseClient, "rpc">) {
  async function rpc<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const result = await supabase.rpc(name, args);
    if (result.error) {
      throw new GatewayRepositoryError(name, result.error);
    }
    return result.data as T;
  }

  return {
    claimTask(taskId: string, deviceId: string): Promise<ClaimedTask> {
      return rpc("claim_ai_task", {
        target_task_id: taskId,
        target_device_id: deviceId,
      });
    },

    hydrateAuthorizedRoomContext(
      taskId: string,
      attemptId: string,
    ): Promise<HydrationOutcome> {
      return rpc("hydrate_authorized_room_context", {
        target_task_id: taskId,
        target_attempt_id: attemptId,
      });
    },

    appendTaskEvent({
      taskId,
      deviceId,
      attemptId,
      sequence,
      event,
    }: AppendTaskEventInput): Promise<number> {
      const { type, ...payload } = event;
      return rpc("append_ai_task_event", {
        target_task_id: taskId,
        target_device_id: deviceId,
        target_attempt_id: attemptId,
        target_sequence: sequence,
        target_type: type,
        target_payload: payload,
      });
    },

    async renewTaskLeases(
      deviceId: string,
      attempts: ActiveTaskLease[],
    ): Promise<RenewedLease[]> {
      const rows = await rpc<RenewedLeaseRow[]>("renew_ai_task_leases", {
        target_device_id: deviceId,
        target_attempts: attempts,
      });
      return rows.map((row) => ({
        taskId: row.task_id,
        attemptId: row.attempt_id,
      }));
    },

    settleTask({
      taskId,
      deviceId,
      attemptId,
      operation,
      code,
      message,
      result,
      partial,
    }: SettleTaskInput): Promise<SettlementAck> {
      return rpc("settle_ai_task", {
        target_task_id: taskId,
        target_device_id: deviceId,
        target_attempt_id: attemptId,
        target_operation: operation,
        target_code: code,
        target_message: message,
        target_result: result,
        target_partial: partial,
      });
    },

    acknowledgeTaskCancellation(
      taskId: string,
      attemptId: string,
      deviceId: string,
    ): Promise<SettlementAck> {
      return rpc("acknowledge_task_cancellation", {
        target_task_id: taskId,
        target_attempt_id: attemptId,
        target_device_id: deviceId,
      });
    },

    async listDispatchableTasks(
      connectedDeviceIds: string[],
    ): Promise<DispatchableTask[]> {
      const rows = await rpc<DispatchableTaskRow[]>(
        "list_dispatchable_ai_tasks",
        { connected_device_ids: connectedDeviceIds },
      );
      return rows.map((row) => ({
        kind: row.kind,
        taskId: row.task_id,
        deviceId: row.device_id,
        status: row.status,
        attemptId: row.attempt_id,
      })) as DispatchableTask[];
    },

    async reapExpiredTaskLeases(): Promise<ReapedTaskLease[]> {
      const rows = await rpc<ReapedTaskLeaseRow[]>(
        "reap_expired_ai_task_leases",
        {},
      );
      return rows.map((row) => ({
        taskId: row.task_id,
        attemptId: row.attempt_id,
        outcome: row.outcome,
      }));
    },

    async getExecutionDeviceForAuth(
      deviceId: string,
    ): Promise<AuthenticatedDevice | null> {
      const rows = await rpc<AuthenticatedDeviceRow[]>(
        "get_execution_device_for_auth",
        { target_device_id: deviceId },
      );
      const row = rows[0];
      return row
        ? {
            id: row.id,
            userId: row.user_id,
            tokenHash: row.token_hash,
            status: row.status,
          }
        : null;
    },

    recordDeviceConnection(
      deviceId: string,
      connectorVersion: string,
    ): Promise<ExecutionDeviceStatus> {
      return rpc<ExecutionDeviceStatus>("record_device_connection", {
        target_device_id: deviceId,
        target_connector_version: connectorVersion,
      });
    },

    async upsertProviderConnections(
      deviceId: string,
      statuses: ProviderStatus[],
    ): Promise<void> {
      await rpc<null>("upsert_provider_connections", {
        target_device_id: deviceId,
        target_statuses: statuses,
      });
    },

    getAiTaskLeaseSeconds(): Promise<number> {
      return rpc("get_ai_task_lease_seconds", {});
    },

    async listDispatchableProviderSetups(
      connectedDeviceIds: string[],
    ): Promise<DispatchableProviderSetup[]> {
      const rows = await rpc<DispatchableProviderSetupRow[]>(
        "list_dispatchable_provider_setups",
        { connected_device_ids: connectedDeviceIds },
      );
      return rows.map((row) => ({
        requestId: row.request_id,
        deviceId: row.device_id,
        provider: row.provider,
      }));
    },

    async recordProviderSetupProgress({
      requestId,
      deviceId,
      stage,
      message,
    }: RecordProviderSetupProgressInput): Promise<void> {
      await rpc("record_provider_setup_progress", {
        target_request_id: requestId,
        target_device_id: deviceId,
        target_stage: stage,
        target_message: message,
      });
    },

    async settleProviderSetup({
      requestId,
      deviceId,
      succeeded,
      status,
      code,
      message,
    }: SettleProviderSetupInput): Promise<void> {
      await rpc("settle_provider_setup_request", {
        target_request_id: requestId,
        target_device_id: deviceId,
        target_success: succeeded,
        target_provider_status: status,
        target_error_code: code,
        target_error_message: message,
      });
    },
  };
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
