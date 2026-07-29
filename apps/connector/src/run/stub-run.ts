import type { TaskEvent } from "@meld/contracts";

const DEFAULT_INTERVAL_MS = 500;

const STUB_EVENTS: readonly TaskEvent[] = [
  {
    type: "progress",
    label: "Starting task",
    percent: 25,
  },
  {
    type: "text.delta",
    text: "Stub connector output.",
  },
  {
    type: "progress",
    label: "Finishing task",
    percent: 100,
  },
];

interface StubRunOptions {
  taskId: string;
  attemptId: string;
  send(event: TaskEvent): void;
  intervalMs?: number;
  onComplete?(): void;
}

export interface StubRun {
  readonly taskId: string;
  readonly attemptId: string;
  readonly abortedReason: string | undefined;
  abort(reason: string): void;
}

export function createStubRun({
  taskId,
  attemptId,
  send,
  intervalMs = DEFAULT_INTERVAL_MS,
  onComplete,
}: StubRunOptions): StubRun {
  let timer: NodeJS.Timeout | undefined;
  let nextEvent = 0;
  let abortedReason: string | undefined;

  function scheduleNext(): void {
    timer = setTimeout(() => {
      timer = undefined;
      if (abortedReason !== undefined) {
        return;
      }

      const event = STUB_EVENTS[nextEvent];
      if (!event) {
        onComplete?.();
        return;
      }

      nextEvent += 1;
      send(event);
      scheduleNext();
    }, intervalMs);
  }

  scheduleNext();

  return {
    taskId,
    attemptId,
    get abortedReason() {
      return abortedReason;
    },
    abort(reason) {
      if (abortedReason !== undefined) {
        return;
      }
      abortedReason = reason;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
