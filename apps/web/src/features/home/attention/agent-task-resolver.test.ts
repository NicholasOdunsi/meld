import { expect, it } from "vitest";
import {
  createAgentTaskResolver,
  type AgentTaskQueryClient,
  type AgentTaskRow,
} from "./agent-task-resolver";

const CONTEXT = {
  userId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000001",
};

type RecordedCalls = {
  from: string[];
  select: string[];
  eq: Array<[string, string]>;
  in: Array<[string, readonly string[]]>;
  order: Array<[string, { ascending: boolean }]>;
  limit: number[];
};

function spyClient(result: {
  data: AgentTaskRow[] | null;
  error: { message: string } | null;
}) {
  const calls: RecordedCalls = {
    from: [],
    select: [],
    eq: [],
    in: [],
    order: [],
    limit: [],
  };

  const client: AgentTaskQueryClient = {
    from: (table) => {
      calls.from.push(table);
      return {
        select: (columns) => {
          calls.select.push(columns);
          return {
            eq: (userColumn, userValue) => {
              calls.eq.push([userColumn, userValue]);
              return {
                eq: (workspaceColumn, workspaceValue) => {
                  calls.eq.push([workspaceColumn, workspaceValue]);
                  return {
                    in: (statusColumn, statuses) => {
                      calls.in.push([statusColumn, statuses]);
                      return {
                        order: (orderColumn, options) => {
                          calls.order.push([orderColumn, options]);
                          return {
                            limit: async (count: number) => {
                              calls.limit.push(count);
                              return result;
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

function row(overrides: Partial<AgentTaskRow> = {}): AgentTaskRow {
  return {
    id: "50000000-0000-4000-8000-000000000005",
    room_id: "40000000-0000-4000-8000-000000000004",
    status: "needs_review",
    error_message: null,
    updated_at: "2026-08-20T10:00:00.000Z",
    rooms: { name: "First run", workspace_id: CONTEXT.workspaceId },
    ...overrides,
  };
}

it("asks the database for this user's held work in this workspace", async () => {
  const { client, calls } = spyClient({ data: [], error: null });

  await createAgentTaskResolver(client, "approval_request").resolve(CONTEXT);

  expect(calls.from).toEqual(["ai_tasks"]);
  expect(calls.eq).toEqual([
    ["initiating_user_id", CONTEXT.userId],
    ["rooms.workspace_id", CONTEXT.workspaceId],
  ]);
  expect(calls.in).toEqual([["status", ["needs_review"]]]);
  expect(calls.order).toEqual([["updated_at", { ascending: false }]]);
});

it("maps a held run to an approval row", async () => {
  const { client } = spyClient({ data: [row()], error: null });

  const items = await createAgentTaskResolver(
    client,
    "approval_request",
  ).resolve(CONTEXT);

  expect(items).toEqual([
    {
      id: "50000000-0000-4000-8000-000000000005",
      kind: "approval_request",
      title: "An agent finished and is waiting on your yes or no.",
      roomId: "40000000-0000-4000-8000-000000000004",
      roomName: "First run",
      occurredAt: "2026-08-20T10:00:00.000Z",
      href: `/${CONTEXT.workspaceId}/rooms/40000000-0000-4000-8000-000000000004`,
      actionLabel: "REVIEW",
    },
  ]);
});

it("asks for failed runs and reports the error", async () => {
  const { client, calls } = spyClient({
    data: [
      row({ status: "failed", error_message: "The provider timed out." }),
    ],
    error: null,
  });

  const items = await createAgentTaskResolver(
    client,
    "agent_run_failed",
  ).resolve(CONTEXT);

  expect(calls.in).toEqual([["status", ["failed"]]]);
  expect(items[0].kind).toBe("agent_run_failed");
  expect(items[0].title).toBe("The provider timed out.");
});

it("falls back to a generic title when there is no error message", async () => {
  const { client } = spyClient({
    data: [row({ status: "failed", error_message: null })],
    error: null,
  });

  const items = await createAgentTaskResolver(
    client,
    "agent_run_failed",
  ).resolve(CONTEXT);

  expect(items[0].title).toBe("An agent run failed.");
});

it("drops rows from another workspace", async () => {
  const { client } = spyClient({
    data: [
      row({
        rooms: {
          name: "Elsewhere",
          workspace_id: "90000000-0000-4000-8000-000000000009",
        },
      }),
    ],
    error: null,
  });

  const items = await createAgentTaskResolver(
    client,
    "approval_request",
  ).resolve(CONTEXT);

  expect(items).toEqual([]);
});

it("throws when the query fails so the registry can log and continue", async () => {
  const { client } = spyClient({
    data: null,
    error: { message: "boom" },
  });

  await expect(
    createAgentTaskResolver(client, "approval_request").resolve(CONTEXT),
  ).rejects.toThrow("We could not load agent runs.");
});
