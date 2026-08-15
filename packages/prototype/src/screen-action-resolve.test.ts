import { describe, expect, it } from "vitest";
import { resolveActionTargets } from "./screen-action-resolve";

const SCREEN_LOGIN = "11111111-1111-4111-8111-111111111111";
const SCREEN_HOME = "22222222-2222-4222-8222-222222222222";
const SCREEN_MANUAL = "33333333-3333-4333-8333-333333333333";

const nodeToScreenId = new Map([
  ["login", SCREEN_LOGIN],
  ["home", SCREEN_HOME],
]);

describe("resolveActionTargets", () => {
  it("resolves a targetNodeId to its screen (A1)", () => {
    const resolved = resolveActionTargets(
      [{ id: "go", label: "Continue", targetNodeId: "home" }],
      { nodeToScreenId },
    );
    expect(resolved).toEqual([
      { id: "go", label: "Continue", targetScreenId: SCREEN_HOME },
    ]);
  });

  it("lets a manual override win over node resolution (C2a)", () => {
    const resolved = resolveActionTargets(
      [{ id: "go", label: "Continue", targetNodeId: "home" }],
      { nodeToScreenId, overrides: new Map([["go", SCREEN_MANUAL]]) },
    );
    expect(resolved[0].targetScreenId).toBe(SCREEN_MANUAL);
  });

  it("passes through a legacy targetScreenId when no node tag exists", () => {
    const resolved = resolveActionTargets(
      [{ id: "go", label: "Continue", targetScreenId: SCREEN_LOGIN }],
      { nodeToScreenId },
    );
    expect(resolved[0].targetScreenId).toBe(SCREEN_LOGIN);
  });

  it("prefers the node tag over a stale legacy targetScreenId", () => {
    const resolved = resolveActionTargets(
      [
        {
          id: "go",
          label: "Continue",
          targetNodeId: "home",
          targetScreenId: SCREEN_LOGIN,
        },
      ],
      { nodeToScreenId },
    );
    expect(resolved[0].targetScreenId).toBe(SCREEN_HOME);
  });

  it("yields null when the target node has no screen yet", () => {
    const resolved = resolveActionTargets(
      [{ id: "go", label: "Continue", targetNodeId: "checkout" }],
      { nodeToScreenId },
    );
    expect(resolved[0].targetScreenId).toBeNull();
  });

  it("yields null for an action with no target at all", () => {
    const resolved = resolveActionTargets(
      [{ id: "noop", label: "Toggle" }],
      { nodeToScreenId },
    );
    expect(resolved[0].targetScreenId).toBeNull();
  });

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

  it("prefers key resolution over the deprecated node resolution", () => {
    const resolved = resolveActionTargets(
      [
        {
          id: "go",
          label: "Continue",
          targetScreenKey: "home",
          targetNodeId: "login",
        },
      ],
      {
        keyToScreenId: new Map([["home", SCREEN_HOME]]),
        nodeToScreenId,
      },
    );
    expect(resolved[0].targetScreenId).toBe(SCREEN_HOME);
  });

  it("still lets a manual override win over key resolution", () => {
    const resolved = resolveActionTargets(
      [{ id: "go", label: "Continue", targetScreenKey: "home" }],
      {
        keyToScreenId: new Map([["home", SCREEN_HOME]]),
        overrides: new Map([["go", SCREEN_MANUAL]]),
      },
    );
    expect(resolved[0].targetScreenId).toBe(SCREEN_MANUAL);
  });

  it("resolves without keyToScreenId when only legacy options are passed", () => {
    const resolved = resolveActionTargets(
      [{ id: "go", label: "Continue", targetNodeId: "home" }],
      { nodeToScreenId },
    );
    expect(resolved[0].targetScreenId).toBe(SCREEN_HOME);
  });
});
