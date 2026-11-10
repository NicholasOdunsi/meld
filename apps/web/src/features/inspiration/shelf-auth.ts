import "server-only";

import { hashToken, parseCaptureAuthorization } from "@meld/device-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

export type ShelfPrincipal = { tokenId: string; userId: string; workspaceId: string };

const ResolvedTokenSchema = z.object({
  token_id: z.string().uuid(),
  user_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});

// Tokens are looked up by SHA-256 hash; the raw token is never compared or stored.
export async function authenticateShelfRequest(
  request: Request,
  client: SupabaseClient,
): Promise<ShelfPrincipal | null> {
  if (isRoomFakeEnabled()) {
    // FAKE_SHELF_TOKEN is shorter than a real capture token, so the strict parser rejects it.
    const { FAKE_SHELF_TOKEN } = await import("./inspiration-fake");
    if (request.headers.get("authorization") !== `Bearer ${FAKE_SHELF_TOKEN}`) return null;
    const { E2E_WORKSPACE_ID } = await import("@/features/workspaces/e2e-fake");
    return {
      tokenId: "00000000-0000-4000-8000-0000000000cc",
      userId: "00000000-0000-4000-8000-0000000000aa",
      workspaceId: E2E_WORKSPACE_ID,
    };
  }

  const token = parseCaptureAuthorization(request.headers.get("authorization"));
  if (!token) return null;
  const { data, error } = await client.rpc("resolve_capture_token", { presented_token_hash: hashToken(token) });
  if (error) return null;
  const parsed = ResolvedTokenSchema.safeParse(data);
  if (!parsed.success) return null;
  return { tokenId: parsed.data.token_id, userId: parsed.data.user_id, workspaceId: parsed.data.workspace_id };
}
