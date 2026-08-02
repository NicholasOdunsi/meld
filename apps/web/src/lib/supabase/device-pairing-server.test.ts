import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ rpc: vi.fn() })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { createDevicePairingServerClient } from "./device-pairing-server";

describe("device pairing server client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a non-persistent server-only role client", () => {
    createDevicePairingServerClient({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY: "server-only-key",
    });

    expect(mocks.createClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "server-only-key",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  });

  it.each([
    ["NEXT_PUBLIC_SUPABASE_URL", {
      MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY: "server-only-key",
    }],
    ["MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY", {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    }],
  ] as const)(
    "fails clearly when %s is missing without exposing another value",
    (variableName, environment) => {
      expect(() =>
        createDevicePairingServerClient(environment),
      ).toThrow(`Invalid device pairing configuration: ${variableName}`);
      expect(() =>
        createDevicePairingServerClient(environment),
      ).not.toThrow(/server-only-key|127\.0\.0\.1/);
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );
});
