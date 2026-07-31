import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAIContext,
  createDiscoveryRepository,
  mapDiscoveryMessageRow,
} from "./repository";

describe("mapDiscoveryMessageRow", () => {
  it("maps a human query row to a human message without AI provenance", () => {
    const message = mapDiscoveryMessageRow({
      id: "40000000-0000-4000-8000-000000000010",
      room_id: "20000000-0000-4000-8000-000000000001",
      client_id: "30000000-0000-4000-8000-000000000010",
      author_type: "human",
      author_id: "10000000-0000-4000-8000-000000000002",
      initiated_by: null,
      ai_task_id: null,
      provider: null,
      body: "The interviews point to a trust problem.",
      cited_message_ids: [],
      cited_evidence_ids: [],
      assumptions: [],
      suggested_next_questions: [],
      created_at: "2026-07-25T12:00:00.000Z",
    });

    expect(message).toEqual({
      id: "40000000-0000-4000-8000-000000000010",
      roomId: "20000000-0000-4000-8000-000000000001",
      clientId: "30000000-0000-4000-8000-000000000010",
      authorType: "human",
      authorId: "10000000-0000-4000-8000-000000000002",
      initiatedBy: null,
      aiTaskId: null,
      provider: null,
      body: "The interviews point to a trust problem.",
      citedMessageIds: [],
      citedEvidenceIds: [],
      assumptions: [],
      suggestedNextQuestions: [],
      createdAt: "2026-07-25T12:00:00.000Z",
      delivery: "persisted",
    });
  });

  it("carries full Product Agent provenance from a PostgREST query row", () => {
    const message = mapDiscoveryMessageRow({
      id: "40000000-0000-4000-8000-000000000020",
      room_id: "20000000-0000-4000-8000-000000000001",
      client_id: "30000000-0000-4000-8000-000000000020",
      author_type: "product_agent",
      author_id: null,
      initiated_by: "10000000-0000-4000-8000-000000000002",
      ai_task_id: "70000000-0000-4000-8000-000000000007",
      provider: "claude",
      body: "The strongest signal is onboarding trust.",
      cited_message_ids: ["40000000-0000-4000-8000-000000000010"],
      cited_evidence_ids: ["50000000-0000-4000-8000-000000000005"],
      assumptions: ["We assume the beta cohort is representative."],
      suggested_next_questions: [
        "Which onboarding step loses the most users?",
      ],
      created_at: "2026-07-25T12:01:00.000Z",
    });

    expect(message.authorType).toBe("product_agent");
    expect(message.authorId).toBeNull();
    expect(message.initiatedBy).toBe(
      "10000000-0000-4000-8000-000000000002",
    );
    expect(message.aiTaskId).toBe("70000000-0000-4000-8000-000000000007");
    expect(message.provider).toBe("claude");
    expect(message.citedMessageIds).toEqual([
      "40000000-0000-4000-8000-000000000010",
    ]);
    expect(message.citedEvidenceIds).toEqual([
      "50000000-0000-4000-8000-000000000005",
    ]);
    expect(message.assumptions).toEqual([
      "We assume the beta cohort is representative.",
    ]);
    expect(message.suggestedNextQuestions).toEqual([
      "Which onboarding step loses the most users?",
    ]);
  });

  it("survives a raw Realtime row whose array columns arrive as Postgres literals", () => {
    // A postgres_changes INSERT can deliver text[]/uuid[] columns as
    // array-literal strings rather than parsed arrays. Assumptions and
    // suggested questions must still arrive intact.
    const message = mapDiscoveryMessageRow({
      id: "40000000-0000-4000-8000-000000000021",
      room_id: "20000000-0000-4000-8000-000000000001",
      client_id: "30000000-0000-4000-8000-000000000021",
      author_type: "product_agent",
      author_id: null,
      initiated_by: "10000000-0000-4000-8000-000000000002",
      ai_task_id: "70000000-0000-4000-8000-000000000008",
      provider: "codex",
      body: "Grouped the strongest signals.",
      cited_message_ids: "{40000000-0000-4000-8000-000000000010}",
      cited_evidence_ids: "{}",
      assumptions: '{"We assume the beta cohort is representative.","Pricing is fixed."}',
      suggested_next_questions:
        '{"Which onboarding step loses the most users?"}',
      created_at: "2026-07-25T12:02:00.000Z",
    });

    expect(message.authorType).toBe("product_agent");
    expect(message.provider).toBe("codex");
    expect(message.citedMessageIds).toEqual([
      "40000000-0000-4000-8000-000000000010",
    ]);
    expect(message.citedEvidenceIds).toEqual([]);
    expect(message.assumptions).toEqual([
      "We assume the beta cohort is representative.",
      "Pricing is fixed.",
    ]);
    expect(message.suggestedNextQuestions).toEqual([
      "Which onboarding step loses the most users?",
    ]);
  });

  it("defaults an unknown provider and missing arrays safely", () => {
    const message = mapDiscoveryMessageRow({
      id: "40000000-0000-4000-8000-000000000030",
      room_id: "20000000-0000-4000-8000-000000000001",
      client_id: "30000000-0000-4000-8000-000000000030",
      author_id: "10000000-0000-4000-8000-000000000002",
      body: "Plain post",
      provider: "gpt-legacy",
      created_at: "2026-07-25T12:03:00.000Z",
    });

    expect(message.authorType).toBe("human");
    expect(message.provider).toBeNull();
    expect(message.citedMessageIds).toEqual([]);
    expect(message.assumptions).toEqual([]);
    expect(message.suggestedNextQuestions).toEqual([]);
  });
});

it("maps Product Agent provenance through listMessages", async () => {
  const order = vi.fn().mockResolvedValue({
    data: [
      {
        id: "40000000-0000-4000-8000-000000000020",
        room_id: "20000000-0000-4000-8000-000000000001",
        client_id: "30000000-0000-4000-8000-000000000020",
        author_type: "product_agent",
        author_id: null,
        initiated_by: "10000000-0000-4000-8000-000000000002",
        ai_task_id: "70000000-0000-4000-8000-000000000007",
        provider: "claude",
        body: "The strongest signal is onboarding trust.",
        cited_message_ids: [],
        cited_evidence_ids: [],
        assumptions: ["We assume the beta cohort is representative."],
        suggested_next_questions: ["What breaks onboarding trust?"],
        created_at: "2026-07-25T12:01:00.000Z",
      },
    ],
    error: null,
  });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const supabase = {
    from: vi.fn(() => ({ select })),
  } as unknown as SupabaseClient;

  const messages = await createDiscoveryRepository(supabase).listMessages(
    "20000000-0000-4000-8000-000000000001",
  );

  expect(select).toHaveBeenCalledWith(
    expect.stringContaining("assumptions"),
  );
  expect(select).toHaveBeenCalledWith(
    expect.stringContaining("suggested_next_questions"),
  );
  expect(messages[0].authorType).toBe("product_agent");
  expect(messages[0].provider).toBe("claude");
  expect(messages[0].initiatedBy).toBe(
    "10000000-0000-4000-8000-000000000002",
  );
  expect(messages[0].assumptions).toEqual([
    "We assume the beta cohort is representative.",
  ]);
  expect(messages[0].suggestedNextQuestions).toEqual([
    "What breaks onboarding trust?",
  ]);
});

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

it("reclaims the same unattached metadata path and then deletes only its claim", async () => {
  const userId = "40000000-0000-4000-8000-000000000004";
  const roomId = "10000000-0000-4000-8000-000000000001";
  const attachmentId = "30000000-0000-4000-8000-000000000003";
  const storagePath = `${roomId}/${attachmentId}/interview.png`;
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { storage_path: storagePath },
    error: null,
  });
  const claimSelect = vi.fn(() => ({ maybeSingle }));
  const claimIs = vi.fn(() => ({ select: claimSelect }));
  const claimUploadedBy = vi.fn(() => ({ is: claimIs }));
  const claimId = vi.fn(() => ({ eq: claimUploadedBy }));
  const claimRoom = vi.fn(() => ({ eq: claimId }));
  const update = vi.fn(() => ({ eq: claimRoom }));
  const deleteClaim = vi.fn().mockResolvedValue({ error: null });
  const deleteIs = vi.fn(() => ({ eq: deleteClaim }));
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
      update,
      delete: deleteMetadata,
    })),
  } as unknown as SupabaseClient;
  const repository = createDiscoveryRepository(supabase);

  await expect(
    repository.claimStagedAttachmentForDiscard({
      roomId,
      attachmentId,
    }),
  ).resolves.toEqual({ storagePath });
  await expect(
    repository.claimStagedAttachmentForDiscard({
      roomId,
      attachmentId,
    }),
  ).resolves.toEqual({ storagePath });
  await expect(
    repository.deleteClaimedStagedAttachment({
      roomId,
      attachmentId,
    }),
  ).resolves.toBeUndefined();

  expect(update).toHaveBeenNthCalledWith(1, { discard_pending: true });
  expect(update).toHaveBeenNthCalledWith(2, { discard_pending: true });
  expect(claimRoom).toHaveBeenCalledWith("room_id", roomId);
  expect(claimId).toHaveBeenCalledWith("id", attachmentId);
  expect(claimUploadedBy).toHaveBeenCalledWith("uploaded_by", userId);
  expect(claimIs).toHaveBeenCalledWith("message_id", null);
  expect(claimSelect).toHaveBeenCalledWith("storage_path");
  expect(deleteRoom).toHaveBeenCalledWith("room_id", roomId);
  expect(deleteId).toHaveBeenCalledWith("id", attachmentId);
  expect(deleteUploadedBy).toHaveBeenCalledWith("uploaded_by", userId);
  expect(deleteIs).toHaveBeenCalledWith("message_id", null);
  expect(deleteClaim).toHaveBeenCalledWith("discard_pending", true);
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

describe("listAttachmentStoragePaths", () => {
  it("returns the storage path of every attachment in the room", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { storage_path: "room-1/attachment-1/interview.png" },
        { storage_path: "room-1/attachment-2/notes.pdf" },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as unknown as SupabaseClient;

    const paths = await createDiscoveryRepository(
      supabase,
    ).listAttachmentStoragePaths("room-1");

    expect(from).toHaveBeenCalledWith("attachments");
    expect(select).toHaveBeenCalledWith("storage_path");
    expect(eq).toHaveBeenCalledWith("room_id", "room-1");
    expect(paths).toEqual([
      "room-1/attachment-1/interview.png",
      "room-1/attachment-2/notes.pdf",
    ]);
  });

  it("surfaces a friendly error when the query fails", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const select = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ select })),
    } as unknown as SupabaseClient;

    await expect(
      createDiscoveryRepository(supabase).listAttachmentStoragePaths(
        "room-1",
      ),
    ).rejects.toThrow("We could not load the room's attachments.");
  });
});

describe("deleteRoom", () => {
  const userId = "10000000-0000-4000-8000-000000000001";

  function buildSupabase({
    ownedRoomData = { id: "room-1" } as { id: string } | null,
    deleteData = [{ id: "room-1" }] as Array<{ id: string }> | null,
    deleteError = null as { message: string } | null,
  } = {}) {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    const ownershipEq2 = vi.fn().mockResolvedValue({
      data: ownedRoomData,
      error: null,
    });
    const ownershipMaybeSingle = vi.fn(() => ownershipEq2());
    const ownershipEq1 = vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: ownershipMaybeSingle })),
    }));
    const ownershipSelect = vi.fn(() => ({ eq: ownershipEq1 }));

    const deleteSelect = vi.fn().mockResolvedValue({
      data: deleteData,
      error: deleteError,
    });
    const deleteEq = vi.fn(() => ({ select: deleteSelect }));
    const deleteFn = vi.fn(() => ({ eq: deleteEq }));

    const from = vi.fn(() => ({
      select: ownershipSelect,
      delete: deleteFn,
    }));

    const setAuth = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue("ok");
    const channel = vi.fn(() => ({ send }));

    const supabase = {
      auth: { getUser },
      from,
      realtime: { setAuth },
      channel,
    } as unknown as SupabaseClient;

    return { supabase, from, deleteEq, deleteSelect, channel, send, setAuth };
  }

  it("broadcasts a room-deleted event before deleting the room when the caller is the owner", async () => {
    const { supabase, from, deleteEq, deleteSelect, channel, send, setAuth } =
      buildSupabase();

    await expect(
      createDiscoveryRepository(supabase).deleteRoom("room-1"),
    ).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith("discovery_rooms");
    expect(setAuth).toHaveBeenCalled();
    expect(channel).toHaveBeenCalledWith("room:room-1", {
      config: { private: true },
    });
    expect(send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "room-deleted",
      payload: {},
    });
    expect(deleteEq).toHaveBeenCalledWith("id", "room-1");
    expect(deleteSelect).toHaveBeenCalledWith("id");
  });

  it("rejects when RLS silently filters out a non-owner's delete, without broadcasting", async () => {
    const { supabase, channel } = buildSupabase({
      ownedRoomData: null,
      deleteData: [],
    });

    await expect(
      createDiscoveryRepository(supabase).deleteRoom("room-1"),
    ).rejects.toThrow("Only the room owner can delete this room.");
    expect(channel).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error when the delete query fails", async () => {
    const { supabase } = buildSupabase({
      deleteData: null,
      deleteError: { message: "boom" },
    });

    await expect(
      createDiscoveryRepository(supabase).deleteRoom("room-1"),
    ).rejects.toThrow("We could not delete the room.");
  });
});
