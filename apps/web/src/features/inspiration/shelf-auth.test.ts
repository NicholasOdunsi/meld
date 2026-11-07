import { hashToken, mintCaptureToken } from "@meld/device-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { authenticateShelfRequest } from "./shelf-auth";

const PRINCIPAL = {
  token_id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  workspace_id: "33333333-3333-4333-8333-333333333333",
};

function request(authorization?: string) {
  return new Request("http://localhost/api/shelf/rooms", {
    headers: authorization ? { authorization } : {},
  });
}

describe("authenticateShelfRequest", () => {
  it("resolves a valid token by its hash only", async () => {
    const { token } = mintCaptureToken();
    const rpc = vi.fn(async () => ({ data: PRINCIPAL, error: null }));
    const principal = await authenticateShelfRequest(request(`Bearer ${token}`), { rpc } as unknown as SupabaseClient);
    expect(rpc).toHaveBeenCalledWith("resolve_capture_token", { presented_token_hash: hashToken(token) });
    expect(principal).toEqual({ tokenId: PRINCIPAL.token_id, userId: PRINCIPAL.user_id, workspaceId: PRINCIPAL.workspace_id });
  });

  it("returns null without calling the database for a malformed header", async () => {
    const rpc = vi.fn();
    expect(await authenticateShelfRequest(request("Bearer nope"), { rpc } as unknown as SupabaseClient)).toBeNull();
    expect(await authenticateShelfRequest(request(), { rpc } as unknown as SupabaseClient)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns null for an unknown, revoked, or erroring token", async () => {
    const { token } = mintCaptureToken();
    for (const result of [{ data: null, error: null }, { data: null, error: { message: "boom" } }]) {
      const rpc = vi.fn(async () => result);
      expect(await authenticateShelfRequest(request(`Bearer ${token}`), { rpc } as unknown as SupabaseClient)).toBeNull();
    }
  });
});
