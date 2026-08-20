import { expect, it } from "vitest";
import {
  isAnyAgentWorking,
  type PresenceQueryClient,
} from "./agent-presence";

const WORKSPACE = "20000000-0000-4000-8000-000000000001";

function client(result: {
  data: Array<{ id: string }> | null;
  error: { message: string } | null;
}): { client: PresenceQueryClient; statuses: string[][] } {
  const statuses: string[][] = [];
  return {
    statuses,
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: (_column: string, values: readonly string[]) => {
              statuses.push([...values]);
              return { limit: async () => result };
            },
          }),
        }),
      }),
    },
  };
}

it("is true while a run is in flight", async () => {
  const { client: spy, statuses } = client({
    data: [{ id: "task" }],
    error: null,
  });

  expect(await isAnyAgentWorking(spy, WORKSPACE)).toBe(true);
  expect(statuses).toEqual([["running", "ready_to_run", "queued"]]);
});

it("is false when nothing is running", async () => {
  const { client: spy } = client({ data: [], error: null });

  expect(await isAnyAgentWorking(spy, WORKSPACE)).toBe(false);
});

it("is false rather than throwing when the query fails", async () => {
  const { client: spy } = client({ data: null, error: { message: "boom" } });

  expect(await isAnyAgentWorking(spy, WORKSPACE)).toBe(false);
});
