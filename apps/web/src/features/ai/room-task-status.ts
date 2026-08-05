import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AITaskKind,
  AITaskStatus,
  Provider,
} from "@meld/contracts";

// The safe, participant-scoped projection Task 8 exposes through
// list_room_ai_task_statuses. It is the ONLY task-status surface the browser
// may read -- never public.ai_tasks directly -- so it carries identifiers,
// provider, status, and timestamps and nothing else (no instruction, manifest,
// result, or error detail).
export type RoomTaskStatus = {
  taskId: string;
  sourceMessageId: string | null;
  initiatingUserId: string;
  provider: Provider;
  kind: AITaskKind;
  status: AITaskStatus;
  createdAt: string;
  updatedAt: string;
};

const STATUS_READ_ERROR = "We could not load the room's task status.";

// In-flight statuses are the only ones a poll can usefully advance: the task is
// moving toward a reply on its own. Every other status is terminal for polling
// -- either settled (completed/cancelled/failed) or parked awaiting a user
// action (needs_reauthentication/usage_limit_reached/needs_review) that a
// recovery button, not the timer, will drive.
const ACTIVE_TASK_STATUSES: ReadonlySet<AITaskStatus> = new Set<AITaskStatus>([
  "queued",
  "waiting_for_device",
  "ready_to_run",
  "running",
]);

export function isTerminalTaskStatus(status: AITaskStatus): boolean {
  return !ACTIVE_TASK_STATUSES.has(status);
}

type RoomTaskStatusRow = {
  task_id: string;
  source_message_id: string | null;
  initiating_user_id: string;
  provider: Provider;
  kind: AITaskKind;
  status: AITaskStatus;
  created_at: string;
  updated_at: string;
};

function mapRoomTaskStatusRow(row: RoomTaskStatusRow): RoomTaskStatus {
  return {
    taskId: row.task_id,
    sourceMessageId: row.source_message_id ?? null,
    initiatingUserId: row.initiating_user_id,
    provider: row.provider,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Read the room's task statuses through the security-definer RPC. A revoked
// participant simply gets no rows (the RPC returns nothing), which the poller
// reads as "no active tasks" and stops on.
export async function listRoomAiTaskStatuses(
  supabase: SupabaseClient,
  roomId: string,
): Promise<RoomTaskStatus[]> {
  const { data, error } = await supabase.rpc(
    "list_room_ai_task_statuses",
    { target_room_id: roomId },
  );
  if (error) {
    throw new Error(STATUS_READ_ERROR);
  }
  return ((data ?? []) as RoomTaskStatusRow[]).map(mapRoomTaskStatusRow);
}

export const ROOM_TASK_STATUS_POLL_MS = 2000;

export type RoomTaskStatusPollerOptions = {
  fetchStatuses: () => Promise<RoomTaskStatus[]>;
  onStatuses: (statuses: RoomTaskStatus[]) => void;
  onError?: (error: unknown) => void;
  intervalMs?: number;
};

// A framework-agnostic controller for the every-two-seconds status poll. It
// runs only while at least one nonterminal task exists or a mention has just
// queued, and it never touches ai_tasks -- it drives whatever fetcher it is
// handed, which the room wires to listRoomAiTaskStatuses. Realtime message
// insertion remains the authority for the completed reply; this only surfaces
// safe pending state.
export class RoomTaskStatusPoller {
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // A tick is in flight or scheduled. Distinct from `stopped`, which is the
  // permanent teardown latch (unmount / revoked access / read failure).
  private running = false;
  private stopped = false;
  private queuedWhileRunning = false;

  constructor(private readonly options: RoomTaskStatusPollerOptions) {
    this.intervalMs = options.intervalMs ?? ROOM_TASK_STATUS_POLL_MS;
  }

  // Begin polling if not already running and not torn down. Fetches once
  // immediately, then reschedules itself only while an active task remains.
  start(): void {
    if (this.stopped || this.running) {
      return;
    }
    this.running = true;
    void this.tick();
  }

  // A mention just queued a task: poll immediately so the pending state appears
  // without waiting out the interval, restarting the loop if it had gone idle.
  notifyQueued(): void {
    if (this.stopped) {
      return;
    }
    if (this.running) {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
        void this.tick();
        return;
      }
      this.queuedWhileRunning = true;
      return;
    }
    this.start();
  }

  // Permanent teardown for room unmount, revoked access, or a read failure.
  stop(): void {
    this.stopped = true;
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.stopped) {
      return;
    }
    let statuses: RoomTaskStatus[];
    try {
      statuses = await this.options.fetchStatuses();
    } catch (error) {
      this.options.onError?.(error);
      this.stop();
      return;
    }
    if (this.stopped) {
      return;
    }
    this.options.onStatuses(statuses);

    if (this.queuedWhileRunning) {
      this.queuedWhileRunning = false;
      this.timer = setTimeout(() => {
        void this.tick();
      }, 0);
      return;
    }

    const hasActiveTask = statuses.some(
      (task) => !isTerminalTaskStatus(task.status),
    );
    if (!hasActiveTask) {
      // Nothing left to advance: go idle but stay restartable via notifyQueued.
      this.running = false;
      return;
    }
    this.timer = setTimeout(() => {
      void this.tick();
    }, this.intervalMs);
  }
}
