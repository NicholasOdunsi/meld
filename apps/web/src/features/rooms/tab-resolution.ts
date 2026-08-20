import type { PaneTool } from "./pane-layout";

/**
 * What `?tab=` means now, and what it used to mean.
 *
 * The param named a *surface* (`conversation`, `prd`, ...) before this
 * rebuild and names a *tab id* after it. Rather than break every link
 * anyone has pasted, a recognised old surface name resolves to the tool it
 * became -- the caller opens a fresh tab holding it and rewrites the URL.
 * Remove `LEGACY_SURFACES` one release after this ships.
 */
export type TabResolution =
  | { kind: "tab"; tabId: string }
  | { kind: "overview" }
  | { kind: "legacy-tool"; tool: PaneTool }
  | { kind: "fallback" };

const LEGACY_SURFACES: Record<string, PaneTool | "overview" | "fallback"> = {
  "user-flows": "canvas",
  prd: "prd",
  prototype: "prototype",
  // The conversation is the dock now: it is on every tab, so this link just
  // wants the room.
  conversation: "fallback",
  // Decisions moved inside Overview.
  decisions: "overview",
  overview: "overview",
};

export function resolveTabParam(
  requested: unknown,
  options: { tabIds: readonly string[]; hasOverview: boolean },
): TabResolution {
  if (typeof requested !== "string") return { kind: "fallback" };

  if (options.tabIds.includes(requested)) {
    return { kind: "tab", tabId: requested };
  }

  const legacy = LEGACY_SURFACES[requested];
  if (legacy === undefined) return { kind: "fallback" };
  if (legacy === "fallback") return { kind: "fallback" };
  if (legacy === "overview") {
    return options.hasOverview ? { kind: "overview" } : { kind: "fallback" };
  }
  return { kind: "legacy-tool", tool: legacy };
}
