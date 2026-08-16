import { expect, it } from "vitest";
import {
  createMentionResolver,
  type MentionQueryClient,
  type MentionRow,
} from "./mention-resolver";

const CONTEXT = {
  userId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000001",
};

type RecordedCalls = {
  from: string[];
  select: string[];
  eq: Array<[string, string]>;
  is: Array<[string, null]>;
  order: Array<[string, { ascending: boolean }]>;
  limit: number[];
};

// Records the arguments of every chained call. The row-shaped filters
// (mentioned_user_id, workspace_id, acknowledged_at) are delegated to
// PostgREST rather than applied in JS, so asserting on the returned rows
// alone cannot prove the resolver asked for them. Only the recorded
// arguments can.
function spyClient(result: {
  data: MentionRow[] | null;
  error: { message: string } | null;
}) {
  const calls: RecordedCalls = {
    from: [],
    select: [],
    eq: [],
    is: [],
    order: [],
    limit: [],
  };

  const client: MentionQueryClient = {
    from: (table) => {
      calls.from.push(table);
      return {
        select: (columns) => {
          calls.select.push(columns);
          return {
            eq: (userColumn, userValue) => {
              calls.eq.push([userColumn, userValue]);
              return {
                eq: (orgColumn, orgValue) => {
                  calls.eq.push([orgColumn, orgValue]);
                  return {
                    is: (isColumn, isValue) => {
                      calls.is.push([isColumn, isValue]);
                      return {
                        order: (orderColumn, options) => {
                          calls.order.push([orderColumn, options]);
                          return {
                            limit: async (count) => {
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

function clientReturning(rows: MentionRow[]) {
  return spyClient({ data: rows, error: null });
}

it("maps an unacknowledged mention to an attention item", async () => {
  const resolver = createMentionResolver(
    clientReturning([
      {
        id: "50000000-0000-4000-8000-000000000005",
        room_id: "40000000-0000-4000-8000-000000000004",
        created_at: "2026-07-20T10:00:00.000Z",
        rooms: { name: "Checkout", workspace_id: CONTEXT.workspaceId },
      },
    ]).client,
  );

  const items = await resolver.resolve(CONTEXT);

  expect(items).toEqual([
    {
      id: "50000000-0000-4000-8000-000000000005",
      kind: "mention",
      title: "You were mentioned in Checkout",
      roomId: "40000000-0000-4000-8000-000000000004",
      roomName: "Checkout",
      occurredAt: "2026-07-20T10:00:00.000Z",
      href: `/${CONTEXT.workspaceId}/rooms/40000000-0000-4000-8000-000000000004`,
    },
  ]);
});

it("drops mentions from another workspace", async () => {
  const resolver = createMentionResolver(
    clientReturning([
      {
        id: "50000000-0000-4000-8000-000000000006",
        room_id: "40000000-0000-4000-8000-000000000007",
        created_at: "2026-07-20T10:00:00.000Z",
        rooms: {
          name: "Other org room",
          workspace_id: "20000000-0000-4000-8000-000000000099",
        },
      },
    ]).client,
  );

  expect(await resolver.resolve(CONTEXT)).toEqual([]);
});

// The SELECT policy on public.mentions is `using (is_room_participant(room_id))`
// -- room participation only. It does not restrict by mentioned_user_id, so this
// .eq is the sole boundary keeping one room participant out of another
// participant's mentions. It must be asserted, not assumed.
it("restricts the query to the requesting user's own mentions", async () => {
  const spy = clientReturning([]);

  await createMentionResolver(spy.client).resolve(CONTEXT);

  expect(spy.calls.from).toEqual(["mentions"]);
  expect(spy.calls.eq[0]).toEqual(["mentioned_user_id", CONTEXT.userId]);
});

it("reads the mentioned user from the context rather than a fixed value", async () => {
  const spy = clientReturning([]);
  const otherUserId = "10000000-0000-4000-8000-000000000002";

  await createMentionResolver(spy.client).resolve({
    ...CONTEXT,
    userId: otherUserId,
  });

  expect(spy.calls.eq[0]).toEqual(["mentioned_user_id", otherUserId]);
});

it("restricts the query to unacknowledged mentions", async () => {
  const spy = clientReturning([]);

  await createMentionResolver(spy.client).resolve(CONTEXT);

  expect(spy.calls.is).toEqual([["acknowledged_at", null]]);
});

it("selects the room columns the workspace filter depends on", async () => {
  const spy = clientReturning([]);

  await createMentionResolver(spy.client).resolve(CONTEXT);

  expect(spy.calls.select).toEqual([
    "id,room_id,created_at,rooms!inner(name,workspace_id)",
  ]);
  expect(spy.calls.order).toEqual([["created_at", { ascending: false }]]);
});

// The workspace boundary must be enforced by the database, not only by
// the JS .filter() below: `rooms!inner` plus this .eq means
// PostgREST never returns a row from another workspace in the first
// place. This is the shape the non-self-scoped resolvers (approval_request,
// assigned_work) must copy.
it("constrains the embedded room join to the requesting workspace", async () => {
  const spy = clientReturning([]);

  await createMentionResolver(spy.client).resolve(CONTEXT);

  expect(spy.calls.eq[1]).toEqual([
    "rooms.workspace_id",
    CONTEXT.workspaceId,
  ]);
});

it("bounds the number of mentions a single request can pull", async () => {
  const spy = clientReturning([]);

  await createMentionResolver(spy.client).resolve(CONTEXT);

  expect(spy.calls.limit).toEqual([50]);
});

it("throws when the query fails", async () => {
  const resolver = createMentionResolver(
    spyClient({ data: null, error: { message: "boom" } }).client,
  );

  // Anchored: a substring match would still pass if the message later grew a
  // ": boom" suffix and leaked database detail to the user.
  await expect(resolver.resolve(CONTEXT)).rejects.toThrow(
    /^We could not load mentions\.$/,
  );
});
