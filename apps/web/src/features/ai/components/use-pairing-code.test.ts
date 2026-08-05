import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("PAIRING_COMMAND", () => {
  it("uses the canonical local command by default", async () => {
    vi.stubEnv("NEXT_PUBLIC_MELD_PAIR_COMMAND", "");
    delete process.env.NEXT_PUBLIC_MELD_PAIR_COMMAND;

    const { PAIRING_COMMAND } = await import("./use-pairing-code");

    expect(PAIRING_COMMAND).toBe(
      "pnpm --filter @meld/connector cli pair --join",
    );
  });

  it("preserves an explicit public pairing-command override", async () => {
    vi.stubEnv("NEXT_PUBLIC_MELD_PAIR_COMMAND", "meld-dev pair --join");

    const { PAIRING_COMMAND } = await import("./use-pairing-code");

    expect(PAIRING_COMMAND).toBe("meld-dev pair --join");
  });
});
