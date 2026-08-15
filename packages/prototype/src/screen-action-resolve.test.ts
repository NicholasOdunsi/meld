import { describe, expect, it } from "vitest";
import { resolveActionTargets } from "./screen-action-resolve";

const SCREEN_HOME = "22222222-2222-4222-8222-222222222222";

describe("resolveActionTargets", () => {
  it("resolves targetScreenKey to its screen", () => {
    expect(
      resolveActionTargets(
        [{ id: "go", label: "Home", targetScreenKey: "home" }],
        { keyToScreenId: new Map([["home", SCREEN_HOME]]) },
      ),
    ).toEqual([{ id: "go", label: "Home", targetScreenId: SCREEN_HOME }]);
  });

  it("falls back to legacy targetScreenId, else null", () => {
    const map = new Map<string, string>();
    expect(
      resolveActionTargets(
        [{ id: "a", label: "A", targetScreenId: SCREEN_HOME }],
        { keyToScreenId: map },
      )[0].targetScreenId,
    ).toBe(SCREEN_HOME);
    expect(
      resolveActionTargets(
        [{ id: "a", label: "A", targetScreenKey: "missing" }],
        { keyToScreenId: map },
      )[0].targetScreenId,
    ).toBeNull();
  });

  it("prefers the key tag over a stale legacy targetScreenId", () => {
    const resolved = resolveActionTargets(
      [
        {
          id: "go",
          label: "Continue",
          targetScreenKey: "home",
          targetScreenId: "11111111-1111-4111-8111-111111111111",
        },
      ],
      { keyToScreenId: new Map([["home", SCREEN_HOME]]) },
    );
    expect(resolved[0].targetScreenId).toBe(SCREEN_HOME);
  });

  it("yields null for an action with no target at all", () => {
    const resolved = resolveActionTargets(
      [{ id: "noop", label: "Toggle" }],
      { keyToScreenId: new Map() },
    );
    expect(resolved[0].targetScreenId).toBeNull();
  });

  it("resolves without keyToScreenId when none is passed", () => {
    const resolved = resolveActionTargets(
      [{ id: "go", label: "Continue", targetScreenId: SCREEN_HOME }],
      {},
    );
    expect(resolved[0].targetScreenId).toBe(SCREEN_HOME);
  });
});
