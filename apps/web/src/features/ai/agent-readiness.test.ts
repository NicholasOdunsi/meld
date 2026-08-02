import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDevices: vi.fn(),
}));

vi.mock("./device-service", () => ({
  listDevices: mocks.listDevices,
}));

import { resolveAgentReadiness } from "./agent-readiness";

const DEVICE_ID = "30000000-0000-4000-8000-000000000003";
const OTHER_DEVICE_ID = "40000000-0000-4000-8000-000000000004";

function readyConnection(provider: "codex" | "claude") {
  return {
    provider,
    installation: "installed" as const,
    version: "1.0.0",
    authentication: "authenticated" as const,
    compatibility: "supported" as const,
  };
}

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: DEVICE_ID,
    name: "Ada's MacBook",
    platform: "darwin",
    status: "active" as const,
    connectorVersion: "1.0.0",
    lastSeenAt: "2026-07-31T12:00:00.000Z",
    createdAt: "2026-07-30T12:00:00.000Z",
    providers: [readyConnection("codex")],
    ...overrides,
  };
}

// A Supabase double whose only used surface is the RLS-scoped preference read.
function supabaseWithPreference(
  preference: { default_device_id: string; default_provider: string } | null,
): SupabaseClient {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: preference, error: null });
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ maybeSingle })),
    })),
  } as unknown as SupabaseClient;
}

describe("resolveAgentReadiness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("is ready and offers every runnable provider on the default device", async () => {
    mocks.listDevices.mockResolvedValue([
      device({
        providers: [readyConnection("codex"), readyConnection("claude")],
      }),
    ]);

    const readiness = await resolveAgentReadiness(
      supabaseWithPreference({
        default_device_id: DEVICE_ID,
        default_provider: "claude",
      }),
    );

    expect(readiness).toEqual({
      ready: true,
      defaultProvider: "claude",
      defaultDeviceId: DEVICE_ID,
      providers: [
        { provider: "codex", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
        {
          provider: "claude",
          deviceId: DEVICE_ID,
          deviceName: "Ada's MacBook",
        },
      ],
    });
  });

  it("reports no_device when the caller has no saved default", async () => {
    mocks.listDevices.mockResolvedValue([device()]);

    expect(
      await resolveAgentReadiness(supabaseWithPreference(null)),
    ).toEqual({ ready: false, reason: "no_device" });
  });

  it("reports no_device when the default device is not among active devices", async () => {
    mocks.listDevices.mockResolvedValue([
      device({ id: OTHER_DEVICE_ID }),
    ]);

    expect(
      await resolveAgentReadiness(
        supabaseWithPreference({
          default_device_id: DEVICE_ID,
          default_provider: "codex",
        }),
      ),
    ).toEqual({ ready: false, reason: "no_device" });
  });

  it("reports signed_out when the installed provider is not authenticated", async () => {
    mocks.listDevices.mockResolvedValue([
      device({
        providers: [
          {
            provider: "codex",
            installation: "installed",
            version: "1.0.0",
            authentication: "signed_out",
            compatibility: "supported",
          },
        ],
      }),
    ]);

    expect(
      await resolveAgentReadiness(
        supabaseWithPreference({
          default_device_id: DEVICE_ID,
          default_provider: "codex",
        }),
      ),
    ).toEqual({ ready: false, reason: "signed_out" });
  });

  it("reports unsupported when the installed provider is outdated", async () => {
    mocks.listDevices.mockResolvedValue([
      device({
        providers: [
          {
            provider: "codex",
            installation: "installed",
            version: "0.0.1",
            authentication: "authenticated",
            compatibility: "outdated",
          },
        ],
      }),
    ]);

    expect(
      await resolveAgentReadiness(
        supabaseWithPreference({
          default_device_id: DEVICE_ID,
          default_provider: "codex",
        }),
      ),
    ).toEqual({ ready: false, reason: "unsupported" });
  });

  it("is ready via another provider when the saved default is not runnable", async () => {
    // The saved default is claude, which is signed out, but codex is ready.
    // Readiness must NOT dead-end the user: ready true, default falls back to
    // the ready provider, and the picker offers it (the RPC accepts it as an
    // override for the default device).
    mocks.listDevices.mockResolvedValue([
      device({
        providers: [
          readyConnection("codex"),
          {
            provider: "claude",
            installation: "installed",
            version: "1.0.0",
            authentication: "signed_out",
            compatibility: "supported",
          },
        ],
      }),
    ]);

    expect(
      await resolveAgentReadiness(
        supabaseWithPreference({
          default_device_id: DEVICE_ID,
          default_provider: "claude",
        }),
      ),
    ).toEqual({
      ready: true,
      defaultProvider: "codex",
      defaultDeviceId: DEVICE_ID,
      providers: [
        { provider: "codex", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
      ],
    });
  });

  it("keeps the saved default when it is runnable even if another provider is too", async () => {
    mocks.listDevices.mockResolvedValue([
      device({
        providers: [readyConnection("codex"), readyConnection("claude")],
      }),
    ]);

    const readiness = await resolveAgentReadiness(
      supabaseWithPreference({
        default_device_id: DEVICE_ID,
        default_provider: "claude",
      }),
    );

    expect(readiness).toMatchObject({
      ready: true,
      defaultProvider: "claude",
    });
  });

  it("returns signed_out (not offline) for an online device whose only provider is signed out", async () => {
    // lastSeenAt is set (device online) and the default provider is signed out
    // with no other ready provider: the reason names the sign-out, never
    // 'offline', which is reserved for a device with nothing installed.
    mocks.listDevices.mockResolvedValue([
      device({
        lastSeenAt: "2026-07-31T12:00:00.000Z",
        providers: [
          {
            provider: "codex",
            installation: "installed",
            version: "1.0.0",
            authentication: "signed_out",
            compatibility: "supported",
          },
        ],
      }),
    ]);

    expect(
      await resolveAgentReadiness(
        supabaseWithPreference({
          default_device_id: DEVICE_ID,
          default_provider: "codex",
        }),
      ),
    ).toEqual({ ready: false, reason: "signed_out" });
  });

  it("returns offline only when no provider is installed on the device", async () => {
    mocks.listDevices.mockResolvedValue([
      device({
        providers: [
          {
            provider: "codex",
            installation: "not_installed",
            version: null,
            authentication: "unknown",
            compatibility: "unavailable",
          },
        ],
      }),
    ]);

    expect(
      await resolveAgentReadiness(
        supabaseWithPreference({
          default_device_id: DEVICE_ID,
          default_provider: "codex",
        }),
      ),
    ).toEqual({ ready: false, reason: "offline" });
  });

  it("reads live rows rather than trusting a revoked device", async () => {
    // The device was the saved default but has since been revoked; it must not
    // count as active even though the preference still points at it.
    mocks.listDevices.mockResolvedValue([
      device({ status: "revoked" }),
    ]);

    expect(
      await resolveAgentReadiness(
        supabaseWithPreference({
          default_device_id: DEVICE_ID,
          default_provider: "codex",
        }),
      ),
    ).toEqual({ ready: false, reason: "no_device" });
  });
});
