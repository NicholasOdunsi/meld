import { describe, expect, it } from "vitest";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { resolveEffectiveRouting } from "./routing-model";

const DEVICE_ID = "d0000000-0000-4000-8000-000000000000";

const READY: AgentReadiness = {
  ready: true,
  defaultProvider: "codex",
  defaultDeviceId: DEVICE_ID,
  providers: [
    { provider: "codex", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
    { provider: "claude", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
  ],
};

describe("resolveEffectiveRouting", () => {
  it("prefers a sticky override that is still runnable", () => {
    expect(
      resolveEffectiveRouting(READY, { provider: "claude" }),
    ).toEqual({ provider: "claude", model: "claude-opus-4-8" });
  });

  it("falls back to the saved default when there is no override", () => {
    expect(resolveEffectiveRouting(READY, undefined)).toEqual({
      provider: "codex",
      model: "gpt-5.5",
    });
  });

  it("drops a stale override whose provider is no longer runnable", () => {
    const onlyCodex: AgentReadiness = {
      ...READY,
      providers: [READY.providers[0]],
    };

    // The user picked Claude in this room, then signed Claude out. What will
    // really answer is Codex, and that is what the chip must say.
    expect(
      resolveEffectiveRouting(onlyCodex, { provider: "claude" }),
    ).toEqual({ provider: "codex", model: "gpt-5.5" });
  });

  it("falls back to the first ready provider when the saved default is not runnable", () => {
    const claudeOnly: AgentReadiness = {
      ...READY,
      defaultProvider: "codex",
      providers: [READY.providers[1]],
    };

    expect(resolveEffectiveRouting(claudeOnly, undefined)).toEqual({
      provider: "claude",
      model: "claude-opus-4-8",
    });
  });

  it("resolves nothing while readiness is loading or not ready", () => {
    expect(
      resolveEffectiveRouting(undefined, { provider: "claude" }),
    ).toBeUndefined();
    expect(
      resolveEffectiveRouting({ ready: false, reason: "no_device" }, undefined),
    ).toBeUndefined();
  });

  it("never resolves a provider outside the runnable set", () => {
    for (const override of [undefined, { provider: "claude" as const }]) {
      const resolved = resolveEffectiveRouting(READY, override);
      expect(
        READY.providers.some((c) => c.provider === resolved?.provider),
      ).toBe(true);
    }
  });

  it("keeps a valid model override and falls back when the connector no longer advertises it", () => {
    const readiness: AgentReadiness = {
      ...READY,
      providers: [
        {
          provider: "claude",
          deviceId: DEVICE_ID,
          deviceName: "Ada's MacBook",
          models: ["claude-opus-4-8", "claude-sonnet-4-5"],
          defaultModel: "claude-opus-4-8",
        },
      ],
      defaultProvider: "claude",
    };

    expect(
      resolveEffectiveRouting(readiness, {
        provider: "claude",
        model: "claude-sonnet-4-5",
      }),
    ).toEqual({ provider: "claude", model: "claude-sonnet-4-5" });
    expect(
      resolveEffectiveRouting(readiness, {
        provider: "claude",
        model: "claude-haiku-4-5",
      }),
    ).toEqual({ provider: "claude", model: "claude-opus-4-8" });
  });
});
