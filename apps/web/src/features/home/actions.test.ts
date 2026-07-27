import { beforeEach, describe, expect, it, vi } from "vitest";

// This test exists to prove listAttentionItems actually composes the
// mention resolver into the pipeline. It is easy to delete
// createMentionResolver(...) from the resolvers array in actions.ts --
// typecheck and lint stay green because of the `as unknown as` cast, and
// every other test suite in this repo still passes -- while Needs attention
// silently shows "You're all caught up" forever for every user. Only a test
// that exercises listAttentionItems end to end, asserting on a real mapped
// AttentionItem, can catch that regression.
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { listAttentionItems } from "./actions";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "20000000-0000-4000-8000-000000000001";
const MENTION_ID = "50000000-0000-4000-8000-000000000005";
const ROOM_ID = "40000000-0000-4000-8000-000000000004";

// Mirrors the real chain the mention resolver drives:
// from().select().eq().eq().is().order().limit().
function supabaseClientReturning(rows: unknown[]) {
  return {
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: async () => ({
                  data: rows,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

describe("listAttentionItems", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("composes the mention resolver into a mapped AttentionItem", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mocks.createClient.mockResolvedValue(
      supabaseClientReturning([
        {
          id: MENTION_ID,
          room_id: ROOM_ID,
          created_at: "2026-07-20T10:00:00.000Z",
          discovery_rooms: {
            name: "Checkout",
            organization_id: ORGANIZATION_ID,
          },
        },
      ]),
    );

    const items = await listAttentionItems(ORGANIZATION_ID);

    expect(items).toEqual([
      {
        id: MENTION_ID,
        kind: "mention",
        title: "You were mentioned in Checkout",
        roomId: ROOM_ID,
        roomName: "Checkout",
        occurredAt: "2026-07-20T10:00:00.000Z",
        href: `/${ORGANIZATION_ID}/discovery/${ROOM_ID}`,
      },
    ]);
  });

  it("returns nothing when there is no authenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.createClient.mockResolvedValue(supabaseClientReturning([]));

    expect(await listAttentionItems(ORGANIZATION_ID)).toEqual([]);
  });
});
