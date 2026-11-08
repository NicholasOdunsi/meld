import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaptureChannel, InspirationMimeType } from "@meld/contracts";
import { z } from "zod";
import { InspirationItemRowSchema, type InspirationItemRow } from "./inspiration-shared";

// Who is acting. The browser path relies on auth.uid() inside the RPC; the
// shelf path uses the service-role client and names the user explicitly.
export type InspirationActor = { kind: "session" } | { kind: "capture"; userId: string };

export type IntentInput = {
  workspaceId: string;
  contentHash: string;
  mimeType: InspirationMimeType;
  byteSize: number;
  width: number;
  height: number;
  sourceUrl: string | null;
  note: string | null;
  channel: CaptureChannel;
};

export interface InspirationRepository {
  createIntent(input: IntentInput): Promise<{ item: InspirationItemRow; duplicate: boolean }>;
  finalize(itemId: string): Promise<void>;
  fail(itemId: string): Promise<void>;
  linkToRoom(roomId: string, itemIds: string[]): Promise<number>;
}

export class InspirationRepositoryError extends Error {
  constructor(readonly code: string) {
    super(`Inspiration RPC failed: ${code}`);
    this.name = "InspirationRepositoryError";
  }
}

const IntentResultSchema = z.object({ item: InspirationItemRowSchema, duplicate: z.boolean() });

export function createInspirationRepository(
  client: SupabaseClient,
  actor: InspirationActor,
): InspirationRepository {
  const actorArgs = actor.kind === "capture" ? { actor_user_id: actor.userId } : {};
  const prefix = actor.kind === "capture" ? "capture_" : "";

  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new InspirationRepositoryError(error.message);
    return data;
  }

  return {
    async createIntent(input) {
      const data = await call(actor.kind === "capture" ? "capture_inspiration_intent" : "create_inspiration_intent", {
        ...actorArgs,
        target_workspace_id: input.workspaceId,
        item_hash: input.contentHash,
        item_mime: input.mimeType,
        item_size: input.byteSize,
        item_width: input.width,
        item_height: input.height,
        item_source_url: input.sourceUrl,
        item_note: input.note,
        item_channel: input.channel,
      });
      const parsed = IntentResultSchema.safeParse(data);
      if (!parsed.success) throw new InspirationRepositoryError("malformed_response");
      return parsed.data;
    },
    async finalize(itemId) {
      await call(`${prefix}finalize_inspiration_item`, { ...actorArgs, target_item_id: itemId });
    },
    async fail(itemId) {
      await call(`${prefix}fail_inspiration_item`, { ...actorArgs, target_item_id: itemId });
    },
    async linkToRoom(roomId, itemIds) {
      if (actor.kind === "capture") {
        // The shelf only ever saves one image per request.
        if (itemIds.length !== 1) throw new InspirationRepositoryError("invalid_request");
        return Number(
          await call("capture_link_inspiration_to_room", {
            actor_user_id: actor.userId,
            target_room_id: roomId,
            target_item_id: itemIds[0],
          }),
        );
      }
      return Number(await call("link_inspiration_to_room", { target_room_id: roomId, target_item_ids: itemIds }));
    },
  };
}
