import "server-only";

import { randomUUID } from "node:crypto";

// The user-flow generation task, faked. Starting a user flow and generating one
// are two different things: `start_user_flow` creates the durable artifact the
// Room's surface is derived from and lives in the room fake beside the other
// artifacts, while generation is a queued AI task and belongs here, with the
// rest of the canvas feature.
//
// Only one property of that task is worth standing in for. Accepting the same
// proposal twice must resurface the run it already started rather than queue a
// second one, and in production that is enforced by a single unique index:
//
//   create unique index ai_tasks_one_user_flow_generate_per_source
//     on public.ai_tasks (source_message_id, kind)
//     where source_message_id is not null and kind = 'user_flow_generate';
//
// so this store is keyed the same way. Everything else about a generation task
// -- provider resolution, the frozen manifest, the connector that executes it,
// and the flow document it produces -- is deliberately absent: there is no sync
// gateway behind the workspace E2E suite, and a faked document would only ever
// prove the fake. tldraw and generation are exercised against a real gateway in
// `playwright.canvas-trial.config.ts`.

type FakeUserFlowGenerationTask = {
  id: string;
  roomId: string;
  sourceMessageId: string;
  createdAt: string;
};

const FAKE_CANVAS_STORE_KEY = Symbol.for("meld.e2e-canvas-store");

function getStore(): FakeUserFlowGenerationTask[] {
  const globalState = globalThis as typeof globalThis & {
    [FAKE_CANVAS_STORE_KEY]?: FakeUserFlowGenerationTask[];
  };
  globalState[FAKE_CANVAS_STORE_KEY] ??= [];
  return globalState[FAKE_CANVAS_STORE_KEY];
}

// Idempotent on the proposing message, in any status -- the same lookup
// `create_user_flow_generate_task_internal` makes before it queues anything.
// Authorization is the caller's job here as it is there: this is reached only
// through `fakeAcceptProposedUserFlow`, which has already insisted the caller
// participates in the Room with edit access.
export function fakeQueueUserFlowGeneration(input: {
  roomId: string;
  sourceMessageId: string;
}): FakeUserFlowGenerationTask {
  const tasks = getStore();
  const existing = tasks.find(
    (task) => task.sourceMessageId === input.sourceMessageId,
  );
  if (existing) return existing;

  const task: FakeUserFlowGenerationTask = {
    id: randomUUID(),
    roomId: input.roomId,
    sourceMessageId: input.sourceMessageId,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
}
