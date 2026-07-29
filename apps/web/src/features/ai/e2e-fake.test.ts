import { afterEach, describe, expect, it, vi } from "vitest";
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
