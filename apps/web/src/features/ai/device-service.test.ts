import type { SupabaseClient } from "@supabase/supabase-js";
import { hashToken } from "@meld/device-auth";
import { describe, expect, it, vi } from "vitest";
import {
  createPairingCode,
  listDevices,
  redeemPairingCode,
  revokeDevice,
} from "./device-service";

const DEVICE_ID = "20000000-0000-4000-8000-000000000002";

function rpcClient(
  result: { data: unknown; error: unknown },
) {
  const rpc = vi.fn().mockResolvedValue(result);
  return {
    rpc,
    supabase: { rpc } as unknown as SupabaseClient,
  };
}

describe("createPairingCode", () => {
  it("sends only the code hash to the RPC and returns plaintext once", async () => {
    const { rpc, supabase } = rpcClient({
      data: "2026-07-28T12:10:00+00:00",
      error: null,
    });

    const result = await createPairingCode(supabase, {
      requestedProvider: "codex",
    });

    expect(result.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(result).toEqual({
      code: result.code,
      expiresAt: "2026-07-28T12:10:00.000Z",
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_device_pairing_code",
      {
        target_code_hash: hashToken(result.code),
        target_requested_provider: "codex",
      },
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(result.code);
    expect(JSON.stringify(result).match(new RegExp(result.code, "g"))).toHaveLength(1);
  });
});

describe("redeemPairingCode", () => {
  it("normalizes before hashing equivalent pairing codes", async () => {
    const first = rpcClient({
      data: [{ requested_provider: "codex" }],
      error: null,
    });
    const second = rpcClient({
      data: [{ requested_provider: "codex" }],
      error: null,
    });

    await redeemPairingCode(first.supabase, {
      code: "abcd-1234",
      platform: "darwin",
      name: "Studio Mac",
    });
    await redeemPairingCode(second.supabase, {
      code: "ABCD1234",
      platform: "darwin",
      name: "Studio Mac",
    });

    expect(first.rpc.mock.calls[0]?.[1].target_code_hash).toBe(
      second.rpc.mock.calls[0]?.[1].target_code_hash,
    );
    expect(first.rpc.mock.calls[0]?.[1].target_code_hash).toBe(
      hashToken("ABCD1234"),
    );
  });

  it("returns the plaintext token while passing only its hash to the RPC", async () => {
    const { rpc, supabase } = rpcClient({
      data: [{ requested_provider: "claude" }],
      error: null,
    });

    const result = await redeemPairingCode(supabase, {
      code: "ABCD1234",
      platform: "darwin",
      name: "Studio Mac",
    });
    const rpcArguments = rpc.mock.calls[0]?.[1];

    expect(result.deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.requestedProvider).toBe("claude");
    expect(rpcArguments).toEqual({
      target_code_hash: hashToken("ABCD1234"),
      target_device_id: result.deviceId,
      target_token_hash: hashToken(result.deviceToken),
      target_platform: "darwin",
      target_name: "Studio Mac",
    });
    expect(JSON.stringify(rpcArguments)).not.toContain(
      result.deviceToken,
    );
  });

  it("surfaces invalid_pairing_code as a typed error", async () => {
    const { supabase } = rpcClient({
      data: null,
      error: { message: "invalid_pairing_code" },
    });

    await expect(
      redeemPairingCode(supabase, {
        code: "ABCD1234",
        platform: "darwin",
        name: "Studio Mac",
      }),
    ).rejects.toMatchObject({
      name: "DeviceServiceError",
      code: "invalid_pairing_code",
    });
  });
});

describe("revokeDevice", () => {
  it("revokes the requested device ID", async () => {
    const { rpc, supabase } = rpcClient({
      data: null,
      error: null,
    });

    await revokeDevice(supabase, DEVICE_ID);

    expect(rpc).toHaveBeenCalledWith("revoke_execution_device", {
      target_device_id: DEVICE_ID,
    });
  });
});

describe("listDevices", () => {
  it("lists the caller's devices with camel-cased timestamps", async () => {
    const { rpc, supabase } = rpcClient({
      data: [
        {
          id: DEVICE_ID,
          name: "Studio Mac",
          platform: "darwin",
          status: "active",
          connector_version: "1.2.3",
          last_seen_at: "2026-07-28T12:05:00+00:00",
          created_at: "2026-07-28T12:00:00+00:00",
          providers: [
            {
              provider: "codex",
              installation: "installed",
              version: "0.20.0",
              authentication: "authenticated",
              compatibility: "supported",
              lastSeenAt: "2026-07-28T12:04:00+00:00",
            },
          ],
        },
      ],
      error: null,
    });

    await expect(listDevices(supabase)).resolves.toEqual([
      {
        id: DEVICE_ID,
        name: "Studio Mac",
        platform: "darwin",
        status: "active",
        connectorVersion: "1.2.3",
        lastSeenAt: "2026-07-28T12:05:00.000Z",
        createdAt: "2026-07-28T12:00:00.000Z",
        providers: [
          {
            provider: "codex",
            installation: "installed",
            version: "0.20.0",
            authentication: "authenticated",
            compatibility: "supported",
            lastSeenAt: "2026-07-28T12:04:00.000Z",
          },
        ],
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_execution_devices");
  });
});
