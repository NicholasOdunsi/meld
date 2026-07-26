import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAIContext,
  createDiscoveryRepository,
} from "./repository";

describe("buildAIContext", () => {
  it("includes only ready extracted text and captions, never storage paths", () => {
    const context = buildAIContext([
      {
        extractionStatus: "ready",
        extractedText: "Validated interview summary",
        caption: null,
        storagePath:
          "20000000-0000-4000-8000-000000000002/private.pdf",
      },
      {
        extractionStatus: "unsupported",
        extractedText: null,
        caption: "Navigation prototype",
        storagePath:
          "20000000-0000-4000-8000-000000000002/private.png",
      },
      {
        extractionStatus: "failed",
        extractedText: "must not leak",
        caption: null,
        storagePath:
          "20000000-0000-4000-8000-000000000002/bad.pdf",
      },
    ]);

    expect(context).toEqual([
      "Validated interview summary",
      "Navigation prototype",
    ]);
    expect(JSON.stringify(context)).not.toContain("private.");
    expect(JSON.stringify(context)).not.toContain("must not leak");
  });
});

it("creates a room through the authorized database function", async () => {
  const room = {
    id: "30000000-0000-4000-8000-000000000003",
    organization_id: "20000000-0000-4000-8000-000000000001",
    name: "Customer interviews",
    owner_id: "10000000-0000-4000-8000-000000000001",
    created_at: "2026-07-25T12:00:00.000Z",
  };
  const rpc = vi.fn().mockResolvedValue({
    data: room,
    error: null,
  });
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: room.owner_id } },
        error: null,
      }),
    },
    rpc,
  } as unknown as SupabaseClient;

  const result = await createDiscoveryRepository(supabase).createRoom({
    organizationId: room.organization_id,
    name: room.name,
  });

  expect(rpc).toHaveBeenCalledWith("create_discovery_room", {
    target_organization_id: room.organization_id,
    room_name: room.name,
  });
  expect(result).toEqual({
    id: room.id,
    organizationId: room.organization_id,
    name: room.name,
    ownerId: room.owner_id,
    createdAt: room.created_at,
    lastActivityAt: room.created_at,
  });
});

// listRooms reads through from().select().eq().order(); the awaited
// order() call is what resolves to the PostgREST payload.
function stubRoomsQuery(
  data: unknown[] | null,
  error: { message: string } | null = null,
) {
  const order = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    select,
    eq,
    order,
  };
}

const ORGANIZATION_ID = "20000000-0000-4000-8000-000000000001";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";

function roomRow(
  id: string,
  createdAt: string,
  messages?: { created_at: string }[],
) {
  return {
    id,
    organization_id: ORGANIZATION_ID,
    name: `Room ${id.slice(0, 1)}`,
    owner_id: OWNER_ID,
    created_at: createdAt,
    ...(messages === undefined ? {} : { messages }),
  };
}

it("falls back to the room's own created_at when it has no messages", async () => {
  const { supabase } = stubRoomsQuery([
    roomRow("30000000-0000-4000-8000-000000000003", "2026-07-01T09:00:00.000Z", []),
    // PostgREST sends [] for an empty embed, but a missing key must not
    // produce undefined either.
    roomRow("40000000-0000-4000-8000-000000000004", "2026-07-02T09:00:00.000Z"),
  ]);

  const rooms = await createDiscoveryRepository(supabase).listRooms(
    ORGANIZATION_ID,
  );

  expect(rooms[0].lastActivityAt).toBe("2026-07-01T09:00:00.000Z");
  expect(rooms[1].lastActivityAt).toBe("2026-07-02T09:00:00.000Z");
  for (const room of rooms) {
    expect(typeof room.lastActivityAt).toBe("string");
    expect(room.lastActivityAt).not.toBeUndefined();
    expect(room.lastActivityAt).not.toBeNull();
    expect(room.lastActivityAt).not.toBe("");
  }
});

it("uses the message timestamp when a room has exactly one message", async () => {
  const { supabase } = stubRoomsQuery([
    roomRow(
      "30000000-0000-4000-8000-000000000003",
      "2026-07-01T09:00:00.000Z",
      [{ created_at: "2026-07-19T17:45:00.000Z" }],
    ),
  ]);

  const rooms = await createDiscoveryRepository(supabase).listRooms(
    ORGANIZATION_ID,
  );

  expect(rooms[0].lastActivityAt).toBe("2026-07-19T17:45:00.000Z");
  expect(rooms[0].createdAt).toBe("2026-07-01T09:00:00.000Z");
});

it("uses the latest message, not the first or last in array order", async () => {
  // The latest timestamp sits in the MIDDLE on purpose: an implementation
  // that took messages[0] would yield 07-10, and one that took the last
  // element would yield 07-15. Only a real max yields 07-22.
  const { supabase } = stubRoomsQuery([
    roomRow(
      "30000000-0000-4000-8000-000000000003",
      "2026-07-01T09:00:00.000Z",
      [
        { created_at: "2026-07-10T08:00:00.000Z" },
        { created_at: "2026-07-22T23:30:00.000Z" },
        { created_at: "2026-07-15T12:00:00.000Z" },
      ],
    ),
  ]);

  const rooms = await createDiscoveryRepository(supabase).listRooms(
    ORGANIZATION_ID,
  );

  expect(rooms[0].lastActivityAt).toBe("2026-07-22T23:30:00.000Z");
  expect(rooms[0].lastActivityAt).not.toBe("2026-07-10T08:00:00.000Z");
  expect(rooms[0].lastActivityAt).not.toBe("2026-07-15T12:00:00.000Z");
});

it("gives each room in one call its own last activity without bleeding", async () => {
  const { supabase } = stubRoomsQuery([
    roomRow(
      "30000000-0000-4000-8000-000000000003",
      "2026-07-01T09:00:00.000Z",
      [
        { created_at: "2026-07-05T08:00:00.000Z" },
        { created_at: "2026-07-09T08:00:00.000Z" },
      ],
    ),
    // No messages: must use its OWN created_at, not the busy room's.
    roomRow("40000000-0000-4000-8000-000000000004", "2026-07-02T09:00:00.000Z", []),
    roomRow(
      "50000000-0000-4000-8000-000000000005",
      "2026-07-03T09:00:00.000Z",
      [
        { created_at: "2026-07-28T06:00:00.000Z" },
        { created_at: "2026-07-11T06:00:00.000Z" },
      ],
    ),
  ]);

  const rooms = await createDiscoveryRepository(supabase).listRooms(
    ORGANIZATION_ID,
  );

  expect(
    rooms.map((room) => [room.id, room.lastActivityAt]),
  ).toEqual([
    ["30000000-0000-4000-8000-000000000003", "2026-07-09T08:00:00.000Z"],
    ["40000000-0000-4000-8000-000000000004", "2026-07-02T09:00:00.000Z"],
    ["50000000-0000-4000-8000-000000000005", "2026-07-28T06:00:00.000Z"],
  ]);
});

it("scopes the room query to the organization and surfaces a failure", async () => {
  const { supabase, from, eq } = stubRoomsQuery([]);

  await createDiscoveryRepository(supabase).listRooms(ORGANIZATION_ID);

  expect(from).toHaveBeenCalledWith("discovery_rooms");
  expect(eq).toHaveBeenCalledWith("organization_id", ORGANIZATION_ID);

  const failing = stubRoomsQuery(null, { message: "permission denied" });
  await expect(
    createDiscoveryRepository(failing.supabase).listRooms(ORGANIZATION_ID),
  ).rejects.toThrow("We could not load rooms.");
});

it("derives the message author from the authenticated client", async () => {
  const insert = vi.fn();
  const single = vi.fn().mockResolvedValue({
    data: {
      id: "30000000-0000-4000-8000-000000000003",
      room_id: "10000000-0000-4000-8000-000000000001",
      client_id: "20000000-0000-4000-8000-000000000002",
      author_id: "40000000-0000-4000-8000-000000000004",
      body: "Research note",
      created_at: "2026-07-25T12:00:00.000Z",
    },
    error: null,
  });
  const select = vi.fn(() => ({ single }));
  insert.mockReturnValue({ select });
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: "40000000-0000-4000-8000-000000000004",
          },
        },
        error: null,
      }),
    },
    from: vi.fn(() => ({ insert })),
  } as unknown as SupabaseClient;

  await createDiscoveryRepository(supabase).postMessage({
    roomId: "10000000-0000-4000-8000-000000000001",
    clientId: "20000000-0000-4000-8000-000000000002",
    body: "Research note",
    mentionedUserIds: [],
    mentionsProductAgent: false,
  });

  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({
      author_id: "40000000-0000-4000-8000-000000000004",
    }),
  );
});

it("returns the existing message for an idempotent client ID retry", async () => {
  const stored = {
    id: "30000000-0000-4000-8000-000000000003",
    room_id: "10000000-0000-4000-8000-000000000001",
    client_id: "20000000-0000-4000-8000-000000000002",
    author_id: "40000000-0000-4000-8000-000000000004",
    body: "Original research note",
    created_at: "2026-07-25T12:00:00.000Z",
  };
  const duplicateSingle = vi.fn().mockResolvedValue({
    data: null,
    error: { code: "23505", message: "duplicate key" },
  });
  const existingSingle = vi.fn().mockResolvedValue({
    data: stored,
    error: null,
  });
  const secondEq = vi.fn(() => ({ single: existingSingle }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const from = vi
    .fn()
    .mockReturnValueOnce({
      insert: () => ({
        select: () => ({ single: duplicateSingle }),
      }),
    })
    .mockReturnValueOnce({
      select: () => ({ eq: firstEq }),
    });
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: stored.author_id } },
        error: null,
      }),
    },
    from,
  } as unknown as SupabaseClient;

  const result = await createDiscoveryRepository(
    supabase,
  ).postMessage({
    roomId: stored.room_id,
    clientId: stored.client_id,
    body: "Changed retry body",
    mentionedUserIds: [],
    mentionsProductAgent: false,
  });

  expect(result).toMatchObject({
    id: stored.id,
    body: "Original research note",
    delivery: "persisted",
  });
  expect(existingSingle).toHaveBeenCalledOnce();
});

it("finds and deletes only the authenticated user's unattached metadata", async () => {
  const userId = "40000000-0000-4000-8000-000000000004";
  const roomId = "10000000-0000-4000-8000-000000000001";
  const attachmentId = "30000000-0000-4000-8000-000000000003";
  const storagePath = `${roomId}/${attachmentId}/interview.png`;
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { storage_path: storagePath },
    error: null,
  });
  const selectIs = vi.fn(() => ({ maybeSingle }));
  const selectUploadedBy = vi.fn(() => ({ is: selectIs }));
  const selectId = vi.fn(() => ({ eq: selectUploadedBy }));
  const selectRoom = vi.fn(() => ({ eq: selectId }));
  const select = vi.fn(() => ({ eq: selectRoom }));
  const deleteIs = vi.fn().mockResolvedValue({ error: null });
  const deleteUploadedBy = vi.fn(() => ({ is: deleteIs }));
  const deleteId = vi.fn(() => ({ eq: deleteUploadedBy }));
  const deleteRoom = vi.fn(() => ({ eq: deleteId }));
  const deleteMetadata = vi.fn(() => ({ eq: deleteRoom }));
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select,
      delete: deleteMetadata,
    })),
  } as unknown as SupabaseClient;
  const repository = createDiscoveryRepository(supabase);

  await expect(
    repository.findStagedAttachment({ roomId, attachmentId }),
  ).resolves.toEqual({ storagePath });
  await expect(
    repository.deleteStagedAttachment({ roomId, attachmentId }),
  ).resolves.toBeUndefined();

  expect(selectRoom).toHaveBeenCalledWith("room_id", roomId);
  expect(selectId).toHaveBeenCalledWith("id", attachmentId);
  expect(selectUploadedBy).toHaveBeenCalledWith("uploaded_by", userId);
  expect(selectIs).toHaveBeenCalledWith("message_id", null);
  expect(deleteRoom).toHaveBeenCalledWith("room_id", roomId);
  expect(deleteId).toHaveBeenCalledWith("id", attachmentId);
  expect(deleteUploadedBy).toHaveBeenCalledWith("uploaded_by", userId);
  expect(deleteIs).toHaveBeenCalledWith("message_id", null);
});

it.each([
  {
    name: "attachment message",
    expectedFallback: "We could not save the attachment.",
    run: (
      repository: ReturnType<typeof createDiscoveryRepository>,
    ) =>
      repository.createAttachmentIntent({
        id: "30000000-0000-4000-8000-000000000003",
        roomId: "10000000-0000-4000-8000-000000000001",
        messageId: "20000000-0000-4000-8000-000000000002",
        fileName: "research.txt",
        mimeType: "text/plain",
        size: 8,
        storagePath:
          "10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000003/research.txt",
        extractionStatus: "ready",
        extractedText: "Research",
      }),
  },
  {
    name: "evidence source",
    expectedFallback: "We could not add evidence.",
    run: (
      repository: ReturnType<typeof createDiscoveryRepository>,
    ) =>
      repository.addEvidence({
        roomId: "10000000-0000-4000-8000-000000000001",
        messageId: "20000000-0000-4000-8000-000000000002",
        title: "Interview",
      }),
  },
  {
    name: "decision source",
    expectedFallback: "We could not add the decision.",
    run: (
      repository: ReturnType<typeof createDiscoveryRepository>,
    ) =>
      repository.addDecision({
        roomId: "10000000-0000-4000-8000-000000000001",
        sourceMessageId:
          "20000000-0000-4000-8000-000000000002",
        summary: "Proceed",
      }),
  },
])(
  "does not bypass a database rejection for a cross-room $name",
  async ({ run, expectedFallback }) => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "23503",
        message: "violates composite foreign key",
      },
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "40000000-0000-4000-8000-000000000004",
            },
          },
          error: null,
        }),
      },
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient;

    await expect(
      run(createDiscoveryRepository(supabase)),
    ).rejects.toThrow(expectedFallback);
    expect(insert).toHaveBeenCalledOnce();
  },
);
