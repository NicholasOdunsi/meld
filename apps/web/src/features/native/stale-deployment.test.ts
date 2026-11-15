// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isStaleDeploymentError, isUserTyping, MIN_RELOAD_GAP_MS, reloadAllowed } from "./stale-deployment";

describe("stale deployment helpers", () => {
  it("recognises the errors an out-of-date page gets", () => {
    expect(isStaleDeploymentError(new Error('Failed to find Server Action "40ab"'))).toBe(true);
    expect(isStaleDeploymentError(new Error("An unexpected response was received from the server."))).toBe(true);
    expect(isStaleDeploymentError("Failed to find Server Action")).toBe(true);
    expect(isStaleDeploymentError(new Error("Network down"))).toBe(false);
    expect(isStaleDeploymentError(undefined)).toBe(false);
  });

  it("treats a field with text in it as someone typing", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    expect(isUserTyping(document)).toBe(false);
    input.value = "half a message";
    expect(isUserTyping(document)).toBe(true);
    input.remove();
    expect(isUserTyping(document)).toBe(false);
  });

  it("does not reload twice within a minute", () => {
    expect(reloadAllowed(null, 5)).toBe(true);
    expect(reloadAllowed(1_000, 1_000 + MIN_RELOAD_GAP_MS - 1)).toBe(false);
    expect(reloadAllowed(1_000, 1_000 + MIN_RELOAD_GAP_MS)).toBe(true);
  });
});
