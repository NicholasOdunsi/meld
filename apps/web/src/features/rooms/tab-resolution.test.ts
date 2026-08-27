import { describe, expect, it } from "vitest";
import { resolveTabParam } from "./tab-resolution";

const TABS = ["tab-a", "tab-b"] as const;
const WITH_OVERVIEW = { tabIds: TABS, hasOverview: true };
const WITHOUT_OVERVIEW = { tabIds: TABS, hasOverview: false };

describe("resolveTabParam", () => {
  it("falls back when no tab is named", () => {
    expect(resolveTabParam(undefined, WITH_OVERVIEW)).toEqual({
      kind: "fallback",
    });
  });

  it("opens a known tab id", () => {
    expect(resolveTabParam("tab-b", WITH_OVERVIEW)).toEqual({
      kind: "tab",
      tabId: "tab-b",
    });
  });

  it("opens overview when the room has one", () => {
    expect(resolveTabParam("overview", WITH_OVERVIEW)).toEqual({
      kind: "overview",
    });
  });

  it("falls back when overview is asked for but not earned", () => {
    expect(resolveTabParam("overview", WITHOUT_OVERVIEW)).toEqual({
      kind: "fallback",
    });
  });

  // Legacy surface names, kept working for one release.
  it.each([
    ["user-flows", "canvas"],
    ["prd", "prd"],
    ["prototype", "prototype"],
  ])("turns the old %s surface into a tab holding %s", (requested, tool) => {
    expect(resolveTabParam(requested, WITHOUT_OVERVIEW)).toEqual({
      kind: "legacy-tool",
      tool,
    });
  });

  it("keeps a full conversation tab addressable across reloads", () => {
    expect(resolveTabParam("conversation", WITHOUT_OVERVIEW)).toEqual({
      kind: "conversation",
    });
  });

  it("sends the old decisions surface to overview when it exists", () => {
    expect(resolveTabParam("decisions", WITH_OVERVIEW)).toEqual({
      kind: "overview",
    });
  });

  it("sends the old decisions surface to the first tab otherwise", () => {
    expect(resolveTabParam("decisions", WITHOUT_OVERVIEW)).toEqual({
      kind: "fallback",
    });
  });

  it("ignores a repeated param", () => {
    expect(resolveTabParam(["tab-a", "tab-b"], WITH_OVERVIEW)).toEqual({
      kind: "fallback",
    });
  });

  it("ignores an unknown value", () => {
    expect(resolveTabParam("nonsense", WITH_OVERVIEW)).toEqual({
      kind: "fallback",
    });
  });
});
