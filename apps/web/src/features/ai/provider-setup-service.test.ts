import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  ProviderSetupServiceError,
  createProviderSetup,
  getProviderSetup,
} from "./provider-setup-service";

const REQUEST_ID = "70000000-0000-4000-8000-000000000007";
const DEVICE_ID = "20000000-0000-4000-8000-000000000002";
const USER_ID = "80000000-0000-4000-8000-000000000008";

// The camelCase row create_provider_setup_request returns as jsonb.
function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    userId: USER_ID,
    deviceId: DEVICE_ID,
    provider: "codex",
    status: "queued",
    stage: null,
    progressMessage: null,
    errorCode: null,
    errorMessage: null,
    createdAt: "2026-07-29T12:00:00+00:00",
    updatedAt: "2026-07-29T12:00:00+00:00",
    completedAt: null,
    ...overrides,
  };
}

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { rpc, supabase: { rpc } as unknown as SupabaseClient };
}

// The snake_case row a direct RLS-scoped SELECT returns.
function selectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    device_id: DEVICE_ID,
    provider: "claude",
    status: "installing",
    stage: "installing",
    progress_message: "Installing the Claude runtime",
    error_code: null,
    error_message: null,
    updated_at: "2026-07-29T12:01:00+00:00",
    ...overrides,
  };
}

function selectClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return {
    from,
    select,
    eq,
    maybeSingle,
    supabase: { from } as unknown as SupabaseClient,
  };
}

describe("createProviderSetup", () => {
  it("passes the device and provider to the setup RPC and parses the view", async () => {
    const { rpc, supabase } = rpcClient({ data: rpcRow(), error: null });

    const view = await createProviderSetup(supabase, {
      deviceId: DEVICE_ID,
      provider: "codex",
    });

    expect(rpc).toHaveBeenCalledWith("create_provider_setup_request", {
      target_device_id: DEVICE_ID,
      target_provider: "codex",
    });
    expect(view).toEqual({
      id: REQUEST_ID,
      deviceId: DEVICE_ID,
      provider: "codex",
      status: "queued",
      stage: null,
      progressMessage: null,
      errorCode: null,
      errorMessage: null,
      updatedAt: "2026-07-29T12:00:00.000Z",
    });
  });

  it("returns the durable view without any provider path or credential fields", async () => {
    const { supabase } = rpcClient({
      data: rpcRow({
        userId: USER_ID,
        createdAt: "2026-07-29T12:00:00+00:00",
        completedAt: null,
      }),
      error: null,
    });

    const view = await createProviderSetup(supabase, {
      deviceId: DEVICE_ID,
      provider: "codex",
    });

    expect(Object.keys(view).sort()).toEqual(
      [
        "deviceId",
        "errorCode",
        "errorMessage",
        "id",
        "progressMessage",
        "provider",
        "stage",
        "status",
        "updatedAt",
      ].sort(),
    );
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/Library|Keychain|token|credential|path/i);
  });

  it("returns the existing active request on a repeated create (idempotency)", async () => {
    const { supabase } = rpcClient({
      data: rpcRow({ status: "installing", stage: "installing" }),
      error: null,
    });

    const view = await createProviderSetup(supabase, {
      deviceId: DEVICE_ID,
      provider: "codex",
    });

    expect(view.id).toBe(REQUEST_ID);
    expect(view.status).toBe("installing");
  });

  it("maps an invalid device error to a not_found service error", async () => {
    const { supabase } = rpcClient({
      data: null,
      error: { message: "invalid_provider_setup_request" },
    });

    await expect(
      createProviderSetup(supabase, {
        deviceId: DEVICE_ID,
        provider: "codex",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("maps an unexpected error to a generic setup failure", async () => {
    const { supabase } = rpcClient({
      data: null,
      error: { message: "deadlock detected" },
    });

    await expect(
      createProviderSetup(supabase, {
        deviceId: DEVICE_ID,
        provider: "codex",
      }),
    ).rejects.toMatchObject({ code: "provider_setup_failed" });
  });
});

describe("getProviderSetup", () => {
  it("reads the RLS-scoped row and maps it to the camelCase view", async () => {
    const { from, select, eq, supabase } = selectClient({
      data: selectRow(),
      error: null,
    });

    const view = await getProviderSetup(supabase, REQUEST_ID);

    expect(from).toHaveBeenCalledWith("provider_setup_requests");
    expect(select).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", REQUEST_ID);
    expect(view).toEqual({
      id: REQUEST_ID,
      deviceId: DEVICE_ID,
      provider: "claude",
      status: "installing",
      stage: "installing",
      progressMessage: "Installing the Claude runtime",
      errorCode: null,
      errorMessage: null,
      updatedAt: "2026-07-29T12:01:00.000Z",
    });
  });

  it("treats a missing row as not_found", async () => {
    const { supabase } = selectClient({ data: null, error: null });

    await expect(
      getProviderSetup(supabase, REQUEST_ID),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("maps a read error to a generic setup failure", async () => {
    const { supabase } = selectClient({
      data: null,
      error: { message: "connection reset" },
    });

    await expect(
      getProviderSetup(supabase, REQUEST_ID),
    ).rejects.toBeInstanceOf(ProviderSetupServiceError);
  });
});
