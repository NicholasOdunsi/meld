import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { InspirationRepositoryError, createInspirationRepository } from "./inspiration-repository";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ITEM = "11111111-1111-4111-8111-111111111111";
const ROOM = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const ROW = {
  id: ITEM,
  workspace_id: WORKSPACE,
  status: "pending",
  storage_path: `${WORKSPACE}/${ITEM}.png`,
  mime_type: "image/png",
  width: 1,
  height: 1,
  source_url: null,
  note: null,
  capture_channel: "web",
  created_at: "2026-11-06T10:00:00.000Z",
};
const INTENT = {
  workspaceId: WORKSPACE,
  contentHash: "a".repeat(64),
  mimeType: "image/png" as const,
  byteSize: 10,
  width: 1,
  height: 1,
  sourceUrl: null,
  note: null,
  channel: "web" as const,
};

function clientReturning(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { rpc, client: { rpc } as unknown as SupabaseClient };
}

describe("createInspirationRepository (session actor)", () => {
  it("calls create_inspiration_intent with the exact SQL parameter names", async () => {
    const { rpc, client } = clientReturning({ item: ROW, duplicate: false });
    const result = await createInspirationRepository(client, { kind: "session" }).createIntent(INTENT);
    expect(rpc).toHaveBeenCalledWith("create_inspiration_intent", {
      target_workspace_id: WORKSPACE,
      item_hash: "a".repeat(64),
      item_mime: "image/png",
      item_size: 10,
      item_width: 1,
      item_height: 1,
      item_source_url: null,
      item_note: null,
      item_channel: "web",
    });
    expect(result.duplicate).toBe(false);
    expect(result.item.id).toBe(ITEM);
  });

  it("finalizes, fails, and links with session RPCs", async () => {
    const { rpc, client } = clientReturning(1);
    const repository = createInspirationRepository(client, { kind: "session" });
    await repository.finalize(ITEM);
    await repository.fail(ITEM);
    expect(await repository.linkToRoom(ROOM, [ITEM])).toBe(1);
    expect(rpc).toHaveBeenNthCalledWith(1, "finalize_inspiration_item", { target_item_id: ITEM });
    expect(rpc).toHaveBeenNthCalledWith(2, "fail_inspiration_item", { target_item_id: ITEM });
    expect(rpc).toHaveBeenNthCalledWith(3, "link_inspiration_to_room", { target_room_id: ROOM, target_item_ids: [ITEM] });
  });
});

describe("createInspirationRepository (capture actor)", () => {
  it("uses capture_ RPCs and passes the actor explicitly", async () => {
    const { rpc, client } = clientReturning({ item: ROW, duplicate: true });
    const repository = createInspirationRepository(client, { kind: "capture", userId: USER });
    await repository.createIntent(INTENT);
    await repository.finalize(ITEM);
    await repository.fail(ITEM);
    await repository.linkToRoom(ROOM, [ITEM]);
    expect(rpc).toHaveBeenNthCalledWith(1, "capture_inspiration_intent", expect.objectContaining({ actor_user_id: USER }));
    expect(rpc).toHaveBeenNthCalledWith(2, "capture_finalize_inspiration_item", { actor_user_id: USER, target_item_id: ITEM });
    expect(rpc).toHaveBeenNthCalledWith(3, "capture_fail_inspiration_item", { actor_user_id: USER, target_item_id: ITEM });
    expect(rpc).toHaveBeenNthCalledWith(4, "capture_link_inspiration_to_room", {
      actor_user_id: USER,
      target_room_id: ROOM,
      target_item_id: ITEM,
    });
  });

  it("refuses to link more than one item at a time for the shelf", async () => {
    const { client } = clientReturning(1);
    const repository = createInspirationRepository(client, { kind: "capture", userId: USER });
    await expect(repository.linkToRoom(ROOM, [ITEM, ITEM])).rejects.toThrow(InspirationRepositoryError);
  });
});

describe("errors", () => {
  it("wraps RPC errors with the Postgres message as the code", async () => {
    const { client } = clientReturning(null, { message: "not_authorized" });
    await expect(createInspirationRepository(client, { kind: "session" }).finalize(ITEM)).rejects.toMatchObject({
      code: "not_authorized",
    });
  });

  it("rejects a malformed intent payload", async () => {
    const { client } = clientReturning({ item: { id: "x" }, duplicate: false });
    await expect(createInspirationRepository(client, { kind: "session" }).createIntent(INTENT)).rejects.toMatchObject({
      code: "malformed_response",
    });
  });
});
