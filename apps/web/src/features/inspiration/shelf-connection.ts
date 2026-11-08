"use server";

import { mintPairingCode } from "@meld/device-auth";
import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import type { ShelfTokenView } from "./inspiration-shared";

const Uuid = z.string().uuid();
const TOO_MANY_CODES = "Use the code already on screen before making another one.";
const CODE_FAILED = "Couldn't make a code. Try again.";

export async function createShelfConnectCode(
  workspaceId: string,
): Promise<{ status: "created"; code: string; expiresAt: string } | { status: "error"; message: string }> {
  if (!Uuid.safeParse(workspaceId).success) return { status: "error", message: CODE_FAILED };
  if (isRoomFakeEnabled()) {
    const { fakeCreateShelfConnectCode } = await import("./inspiration-fake");
    return fakeCreateShelfConnectCode();
  }
  const { code, codeHash } = mintPairingCode();
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("create_capture_connect_code", {
    target_workspace_id: workspaceId,
    connect_code_hash: codeHash,
  });
  if (error) {
    return { status: "error", message: error.message === "too_many_codes" ? TOO_MANY_CODES : CODE_FAILED };
  }
  return { status: "created", code, expiresAt: String(data) };
}

const TokenRowsSchema = z.array(
  z.object({ id: z.string().uuid(), device_name: z.string(), created_at: z.string(), last_used_at: z.string().nullable() }),
);

export async function listShelfTokens(workspaceId: string): Promise<ShelfTokenView[]> {
  if (!Uuid.safeParse(workspaceId).success) return [];
  if (isRoomFakeEnabled()) {
    const { fakeListShelfTokens } = await import("./inspiration-fake");
    return fakeListShelfTokens();
  }
  const supabase = await createClient(new Headers());
  // Explicit columns: token_hash is not granted to the browser role at all.
  const { data } = await supabase
    .from("capture_tokens")
    .select("id,device_name,created_at,last_used_at")
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const rows = TokenRowsSchema.safeParse(data ?? []);
  if (!rows.success) return [];
  return rows.data.map((row) => ({
    id: row.id,
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export async function revokeShelfToken(tokenId: string): Promise<{ status: "revoked" } | { status: "error" }> {
  if (!Uuid.safeParse(tokenId).success) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const { fakeRevokeShelfToken } = await import("./inspiration-fake");
    fakeRevokeShelfToken(tokenId);
    return { status: "revoked" };
  }
  const supabase = await createClient(new Headers());
  const { error } = await supabase.rpc("revoke_capture_token", { target_token_id: tokenId });
  return error ? { status: "error" } : { status: "revoked" };
}
