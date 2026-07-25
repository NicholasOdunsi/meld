import { expect, it } from "vitest";
import { createMentionResolver, type MentionRow } from "./mention-resolver";

const CONTEXT = {
  userId: "10000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000001",
};

function clientReturning(rows: MentionRow[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: async () => ({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  };
}

it("maps an unacknowledged mention to an attention item", async () => {
  const resolver = createMentionResolver(
    clientReturning([
      {
        id: "50000000-0000-4000-8000-000000000005",
        room_id: "40000000-0000-4000-8000-000000000004",
        created_at: "2026-07-20T10:00:00.000Z",
        discovery_rooms: { name: "Checkout", organization_id: CONTEXT.organizationId },
      },
    ]),
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
      href: `/${CONTEXT.organizationId}/discovery/40000000-0000-4000-8000-000000000004`,
    },
  ]);
});

it("drops mentions from another organization", async () => {
  const resolver = createMentionResolver(
    clientReturning([
      {
        id: "50000000-0000-4000-8000-000000000006",
        room_id: "40000000-0000-4000-8000-000000000007",
        created_at: "2026-07-20T10:00:00.000Z",
        discovery_rooms: {
          name: "Other org room",
          organization_id: "20000000-0000-4000-8000-000000000099",
        },
      },
    ]),
  );

  expect(await resolver.resolve(CONTEXT)).toEqual([]);
});

it("throws when the query fails", async () => {
  const resolver = createMentionResolver({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: async () => ({
              data: null,
              error: { message: "boom" },
            }),
          }),
        }),
      }),
    }),
  });

  await expect(resolver.resolve(CONTEXT)).rejects.toThrow(
    "We could not load mentions.",
  );
});
