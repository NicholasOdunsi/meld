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
