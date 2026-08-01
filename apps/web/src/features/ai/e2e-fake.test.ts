import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  fakeAgentReadiness,
  fakeCreateProviderSetup,
  fakeGetProviderSetup,
  fakeListActiveProviderSetups,
} from "./e2e-fake";
import { isDeviceFakeEnabled } from "./e2e-gate";

describe("device E2E fake gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves fake devices only when the gate is on", async () => {
    vi.stubEnv("MELD_E2E_FAKE_DEVICES", "true");
    expect(isDeviceFakeEnabled()).toBe(true);

    vi.stubEnv("MELD_E2E_FAKE_DEVICES", "false");
    expect(isDeviceFakeEnabled()).toBe(false);
  });

  it("never enables the fake in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MELD_E2E_FAKE_DEVICES", "true");

    expect(isDeviceFakeEnabled()).toBe(false);
  });
});

describe("fake agent readiness", () => {
  it("offers exactly the ready providers on the fake device", () => {
    const readiness = fakeAgentReadiness();

    expect(readiness.ready).toBe(true);
    if (!readiness.ready) {
      return;
    }
    expect(readiness.defaultProvider).toBe("claude");
    expect(readiness.providers.map((provider) => provider.provider).sort()).toEqual(
      ["claude", "codex"],
    );
    for (const provider of readiness.providers) {
      expect(provider.deviceId).toBe("30000000-0000-4000-8000-000000000001");
      expect(provider.deviceName).toBe("Ada's MacBook");
    }
  });
});

describe("fake provider setup progression", () => {
  it("advances installing to completed across polls and drops off the active list", () => {
    const created = fakeCreateProviderSetup({
      deviceId: "30000000-0000-4000-8000-000000000001",
      provider: "claude",
    });
    expect(created.status).toBe("installing");
    expect(
      fakeListActiveProviderSetups().some((view) => view.id === created.id),
    ).toBe(true);

    expect(fakeGetProviderSetup(created.id)?.status).toBe("authenticating");
    expect(fakeGetProviderSetup(created.id)?.status).toBe("verifying");
    expect(fakeGetProviderSetup(created.id)?.status).toBe("completed");
    // Terminal setups leave the active list, and a further poll stays completed.
    expect(fakeGetProviderSetup(created.id)?.status).toBe("completed");
    expect(
      fakeListActiveProviderSetups().some((view) => view.id === created.id),
    ).toBe(false);

    expect(fakeGetProviderSetup("00000000-0000-4000-8000-000000000000")).toBe(
      null,
    );
  });
});
