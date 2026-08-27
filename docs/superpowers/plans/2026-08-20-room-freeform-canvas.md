# Room Freeform Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Room's six-surface tab strip with a blank plane where a collapsible floating toolbar places up to four snapped panes across browser-style workstream tabs, with one Room-wide conversation docked at the bottom.

**Architecture:** Pane geometry is *derived* from pane count and order by pure functions — nothing positional is stored. Tabs live in one new `room_tabs` table, one row per tab, so two people editing different tabs cannot clobber each other. The Overview tab is computed at read time and never written. Every surviving feature component (Conversation, canvas, prototype viewer, PRD document) is reused whole inside a pane or the dock; none is rewritten.

**Tech Stack:** Next.js App Router (React server + client components), TypeScript, Supabase (Postgres + RLS + Realtime), Vitest + Testing Library (jsdom), Playwright, CSS Modules over `--meld-*` design tokens.

**Spec:** `docs/superpowers/specs/2026-08-20-room-freeform-canvas-design.md`

**Scope of this plan:** Delivery-order phases 1–7 from the spec — the complete, working new Room. Phases 8 (agent pane-context) and 9 (presence liveness) are additive and get their own follow-up plan once the shell has landed; they are deliberately not tasks here.

## Global Constraints

Every task's requirements implicitly include this section. These are enforced by `scripts/check-astryx-conventions.mjs`, which fails the build.

- **Tokens only.** `apps/web/src/ui/meld/tokens.css` is the ONLY file permitted a literal hex colour or `px` value. Everything else reaches them through `var(--meld-*)`. Unitless numbers (CSS grid line numbers, `flex: 1`, `z-index`) are not `px` and are permitted.
- **Primitives own their markup.** Files under `apps/web/src/ui/meld/` may use raw `<div>`, `<span>`, `<button>`, `<input>`. **Feature code under `apps/web/src/features/` may not** — it composes primitives instead.
- **Flat.** No offset shadows, no blur, nothing protrudes off the page. Depth is colour and the pixel notch only. Do not add `box-shadow` for elevation anywhere in this plan.
- **The pixel corner:** `clip-path: var(--meld-pixel-corner)`. Two consequences — `clip-path` erases `outline`, so focus rings MUST be `inset box-shadow`; and a border does not follow the staircase, so a visible edge needs the **frame-layer technique** (a filled clipped parent with `padding: var(--meld-pixel-step)` wrapping a second clipped element, exactly as `apps/web/src/ui/meld/text-input.tsx` does).
- **Accent through roles:** `var(--meld-accent)`, `var(--meld-accent-hover)`, `var(--meld-text-on-accent)`. Never the raw `--meld-sky` pigment at a call site.
- **Pixelify Sans (`var(--meld-font-pixel)`) for small metadata, labels and status only.** Never body copy, never titles. Archivo everywhere legible.
- **`data-*` attributes are the test surface.** Hashed CSS-module class names cannot be targeted from a test or a parent. Every new primitive reflects its variant and state as `data-*`.
- **`COMPONENTS.md` is updated in the same commit** that adds or alters a primitive. A stale entry is worse than a missing one.
- **Space tokens:** `--meld-space-1` (4px) through `--meld-space-8` (32px). Text: `--meld-text-xs`, `-sm`, `-base`, `-lg`, `-display`.
- **Verification commands**, run from the repo root:
  - `pnpm --filter web test` — Vitest
  - `pnpm --filter web typecheck` — `tsc --noEmit`
  - `pnpm exec eslint` — lint
  - `node scripts/check-astryx-conventions.mjs` — token/markup conventions
- **Commit after every task.** Conventional commit prefixes (`feat:`, `test:`, `refactor:`, `docs:`) matching the existing log.

---

## File Structure

**New pure modules** — `apps/web/src/features/rooms/`

| File | Responsibility |
| --- | --- |
| `pane-layout.ts` | `MAX_PANES`, `regionsFor`, `canPlace`, `insertPaneAt`, `movePane`, `removePane`. No DOM, no I/O. |
| `overview-eligibility.ts` | Whether the Overview tab exists, from artifact signals ported out of `surfaces.ts`. |
| `tab-resolution.ts` | `?tab=` → active tab, including the one-release legacy surface-name redirect. |

**New data access** — `apps/web/src/features/rooms/`

| File | Responsibility |
| --- | --- |
| `room-tabs-repository.ts` | Reads and writes `room_tabs`. |
| `use-room-tabs-realtime.ts` | Subscribes to `room_tabs` changes for a room. |

**New Meld primitives** — `apps/web/src/ui/meld/` (each with `.module.css` + `.test.tsx`)

| File | Responsibility |
| --- | --- |
| `plane.tsx` | The dot-field work surface and its 2×2 region grid. |
| `pane.tsx` | One framed pane: title bar, close, pop-out, content slot. Owns `MeldPaneRegion`. |
| `toolbar.tsx` | Floating tool list, three row states, collapse, draggable rows. |
| `tab-strip.tsx` | Browser-style strip, `+`, presence slot, rename/reorder/close. |
| `drop-zone.tsx` | A candidate region outline and its active highlight. |
| `dock.tsx` | Bottom band: at-rest composer line, expanded body. |

**New feature components** — `apps/web/src/features/rooms/components/`

| File | Responsibility |
| --- | --- |
| `pane-content.tsx` | Maps a `PaneTool` to its existing feature component. |
| `room-plane.tsx` | Client shell: wires toolbar, panes, tabs, dock, drag state. |
| `room-overview-tab.tsx` | The generated Overview tab's sections. |

**Modified**

| File | Change |
| --- | --- |
| `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx` | Drops from 278 lines to a thin loader. |
| `apps/web/src/features/rooms/backend.ts` / `fake-backend.ts` / `supabase-backend.ts` | Gain the tab methods. |
| `apps/web/src/ui/meld/COMPONENTS.md` | Six new entries. |

**Deleted (Task 19)**

`components/room-tab-strip.tsx` (+ test), `room-tabs.ts` (+ test), `surfaces.ts` (+ test), `components/decisions-surface.tsx` (+ test), `components/stage-coaching-panel.tsx` (+ test), `components/stage-progress-ring.tsx`.

`stage-readiness.ts` and its test **stay**, unreferenced by UI. Every stage migration and RPC **stays**.

---

# Phase A — Foundations

## Task 1: Pane layout maths

The only part of this feature with real logic. Pure, no DOM, provable without rendering anything.

**Files:**
- Create: `apps/web/src/features/rooms/pane-layout.ts`
- Test: `apps/web/src/features/rooms/pane-layout.test.ts`

**Interfaces:**
- Consumes: `MeldPaneRegion` from `@/ui/meld/pane` — but that file does not exist until Task 8. **For this task, declare the region type locally in `pane-layout.ts` and export it as `PaneRegion`.** Task 8 imports it from here rather than redeclaring. This keeps the dependency pointing feature → ui for components and ui → feature for this one type; that is acceptable because it is a type-only import with no runtime edge.
- Produces:
  - `type PaneTool = "canvas" | "prototype" | "prd"`
  - `type PaneRegion = { columnStart: 1 | 2; columnEnd: 2 | 3; rowStart: 1 | 2; rowEnd: 2 | 3 }`
  - `type PaneLayout = PaneTool[]`
  - `const MAX_PANES = 4`
  - `regionsFor(count: number): PaneRegion[]`
  - `canPlace(panes: PaneLayout, tool: PaneTool): boolean`
  - `insertPaneAt(panes: PaneLayout, tool: PaneTool, index: number): PaneLayout`
  - `movePane(panes: PaneLayout, from: number, to: number): PaneLayout`
  - `removePane(panes: PaneLayout, tool: PaneTool): PaneLayout`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/rooms/pane-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_PANES,
  canPlace,
  insertPaneAt,
  movePane,
  regionsFor,
  removePane,
  type PaneLayout,
} from "./pane-layout";

describe("regionsFor", () => {
  it("gives an empty plane no regions", () => {
    expect(regionsFor(0)).toEqual([]);
  });

  it("lets a single pane fill the plane", () => {
    expect(regionsFor(1)).toEqual([
      { columnStart: 1, columnEnd: 3, rowStart: 1, rowEnd: 3 },
    ]);
  });

  it("splits two panes left and right", () => {
    expect(regionsFor(2)).toEqual([
      { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 3 },
      { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 3 },
    ]);
  });

  it("gives three panes a full-height left and a split right", () => {
    expect(regionsFor(3)).toEqual([
      { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 3 },
      { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 2 },
      { columnStart: 2, columnEnd: 3, rowStart: 2, rowEnd: 3 },
    ]);
  });

  it("quarters four panes reading left to right, top to bottom", () => {
    expect(regionsFor(4)).toEqual([
      { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 2 },
      { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 2 },
      { columnStart: 1, columnEnd: 2, rowStart: 2, rowEnd: 3 },
      { columnStart: 2, columnEnd: 3, rowStart: 2, rowEnd: 3 },
    ]);
  });

  it("refuses a count it has no layout for", () => {
    expect(() => regionsFor(5)).toThrow("regionsFor: 5 panes has no layout");
  });
});

describe("canPlace", () => {
  it("allows a tool that is not open", () => {
    expect(canPlace(["prd"], "canvas")).toBe(true);
  });

  // One pane per tool per tab. Two PRD panes would be two windows onto one
  // document; pop-to-new-tab is how you get a second view.
  it("refuses a tool already open in this tab", () => {
    expect(canPlace(["prd"], "prd")).toBe(false);
  });

  it("refuses anything once the tab holds four panes", () => {
    const full: PaneLayout = ["canvas", "prototype", "prd"];
    expect(full.length).toBeLessThan(MAX_PANES);
    expect(canPlace(full, "canvas")).toBe(false);
  });
});

describe("insertPaneAt", () => {
  it("inserts at the given index", () => {
    expect(insertPaneAt(["canvas", "prd"], "prototype", 1)).toEqual([
      "canvas",
      "prototype",
      "prd",
    ]);
  });

  it("appends when the index is past the end", () => {
    expect(insertPaneAt(["canvas"], "prd", 9)).toEqual(["canvas", "prd"]);
  });

  it("treats a negative index as the front", () => {
    expect(insertPaneAt(["canvas"], "prd", -3)).toEqual(["prd", "canvas"]);
  });

  it("returns the layout untouched when the tool is already open", () => {
    const panes: PaneLayout = ["canvas", "prd"];
    expect(insertPaneAt(panes, "prd", 0)).toEqual(["canvas", "prd"]);
  });

  it("does not mutate the layout it was given", () => {
    const panes: PaneLayout = ["canvas"];
    insertPaneAt(panes, "prd", 1);
    expect(panes).toEqual(["canvas"]);
  });
});

describe("movePane", () => {
  it("moves a pane to a later index", () => {
    expect(movePane(["canvas", "prototype", "prd"], 0, 2)).toEqual([
      "prototype",
      "prd",
      "canvas",
    ]);
  });

  it("moves a pane to an earlier index", () => {
    expect(movePane(["canvas", "prototype", "prd"], 2, 0)).toEqual([
      "prd",
      "canvas",
      "prototype",
    ]);
  });

  it("ignores a move that goes nowhere", () => {
    expect(movePane(["canvas", "prd"], 1, 1)).toEqual(["canvas", "prd"]);
  });
});

describe("removePane", () => {
  it("drops the named tool and reflows the rest", () => {
    expect(removePane(["canvas", "prototype", "prd"], "prototype")).toEqual([
      "canvas",
      "prd",
    ]);
  });

  it("is a no-op for a tool that is not open", () => {
    expect(removePane(["canvas"], "prd")).toEqual(["canvas"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test pane-layout`
Expected: FAIL — `Failed to resolve import "./pane-layout"`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/features/rooms/pane-layout.ts`:

```ts
/**
 * Pane geometry, derived rather than stored.
 *
 * A tab persists an *ordered list of tools* and nothing else -- no
 * coordinates, no sizes. Geometry falls out of the list's length and each
 * tool's index, which is why closing a pane reflows the rest with no
 * bookkeeping and why a layout survives any viewport width.
 */

export type PaneTool = "canvas" | "prototype" | "prd";

/** CSS grid lines on the plane's 2x2 grid. `MeldPane` applies these directly. */
export type PaneRegion = {
  columnStart: 1 | 2;
  columnEnd: 2 | 3;
  rowStart: 1 | 2;
  rowEnd: 2 | 3;
};

export type PaneLayout = PaneTool[];

/** Four is the most a tab holds. Beyond it, panes stop being readable. */
export const MAX_PANES = 4;

const LAYOUTS: Record<number, PaneRegion[]> = {
  0: [],
  1: [{ columnStart: 1, columnEnd: 3, rowStart: 1, rowEnd: 3 }],
  2: [
    { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 3 },
    { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 3 },
  ],
  3: [
    { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 3 },
    { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 2 },
    { columnStart: 2, columnEnd: 3, rowStart: 2, rowEnd: 3 },
  ],
  4: [
    { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 2 },
    { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 2 },
    { columnStart: 1, columnEnd: 2, rowStart: 2, rowEnd: 3 },
    { columnStart: 2, columnEnd: 3, rowStart: 2, rowEnd: 3 },
  ],
};

export function regionsFor(count: number): PaneRegion[] {
  const layout = LAYOUTS[count];
  if (!layout) {
    throw new Error(`regionsFor: ${count} panes has no layout`);
  }
  return layout;
}

export function canPlace(panes: PaneLayout, tool: PaneTool): boolean {
  return panes.length < MAX_PANES && !panes.includes(tool);
}

export function insertPaneAt(
  panes: PaneLayout,
  tool: PaneTool,
  index: number,
): PaneLayout {
  if (!canPlace(panes, tool)) return [...panes];
  const at = Math.max(0, Math.min(index, panes.length));
  const next = [...panes];
  next.splice(at, 0, tool);
  return next;
}

export function movePane(
  panes: PaneLayout,
  from: number,
  to: number,
): PaneLayout {
  if (from === to) return [...panes];
  const next = [...panes];
  const [moved] = next.splice(from, 1);
  if (!moved) return [...panes];
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

export function removePane(panes: PaneLayout, tool: PaneTool): PaneLayout {
  return panes.filter((pane) => pane !== tool);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test pane-layout`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms/pane-layout.ts apps/web/src/features/rooms/pane-layout.test.ts
git commit -m "feat(rooms): derive pane geometry from pane count and order"
```

---

## Task 2: Overview eligibility

Ports the artifact-counting logic out of `surfaces.ts` before that file is deleted in Task 19. **Port the logic and its cases; do not re-derive them.**

**Files:**
- Create: `apps/web/src/features/rooms/overview-eligibility.ts`
- Test: `apps/web/src/features/rooms/overview-eligibility.test.ts`
- Read first: `apps/web/src/features/rooms/surfaces.ts` (the `getRoomSurfaces` artifact block)

**Interfaces:**
- Consumes: `RoomStage` from `@meld/contracts`; `STAGE_ORDER` from `./stage-readiness` (which survives).
- Produces: `type RoomArtifactState`, `countArtifacts(state): number`, `hasOverviewTab(state): boolean`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/rooms/overview-eligibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  countArtifacts,
  hasOverviewTab,
  type RoomArtifactState,
} from "./overview-eligibility";

const EMPTY: RoomArtifactState = {
  hasUserFlow: false,
  hasPrd: false,
  hasPrdTask: false,
  hasBuiltDesignScreen: false,
  decisionCount: 0,
  stage: "discovery",
};

describe("countArtifacts", () => {
  it("counts nothing in a fresh room", () => {
    expect(countArtifacts(EMPTY)).toBe(0);
  });

  it("counts a user flow", () => {
    expect(countArtifacts({ ...EMPTY, hasUserFlow: true })).toBe(1);
  });

  // Mirrors surfaces.ts: a queued PRD task counts the same as a PRD.
  it("counts a queued PRD task as a PRD", () => {
    expect(countArtifacts({ ...EMPTY, hasPrdTask: true })).toBe(1);
  });

  it("does not double-count a PRD that also has a task", () => {
    expect(countArtifacts({ ...EMPTY, hasPrd: true, hasPrdTask: true })).toBe(1);
  });

  it("counts decisions only when there is at least one", () => {
    expect(countArtifacts({ ...EMPTY, decisionCount: 0 })).toBe(0);
    expect(countArtifacts({ ...EMPTY, decisionCount: 3 })).toBe(1);
  });

  // Mirrors surfaces.ts: prototype is reachable from the design stage on,
  // before the first screen is built.
  it("counts a prototype once the room reaches design", () => {
    expect(countArtifacts({ ...EMPTY, stage: "design" })).toBe(1);
  });

  it("counts a prototype from a built screen at any stage", () => {
    expect(countArtifacts({ ...EMPTY, hasBuiltDesignScreen: true })).toBe(1);
  });
});

describe("hasOverviewTab", () => {
  it("stays hidden with no artifacts", () => {
    expect(hasOverviewTab(EMPTY)).toBe(false);
  });

  it("stays hidden with exactly one artifact", () => {
    expect(hasOverviewTab({ ...EMPTY, hasPrd: true })).toBe(false);
  });

  it("appears at two artifacts", () => {
    expect(hasOverviewTab({ ...EMPTY, hasPrd: true, hasUserFlow: true })).toBe(
      true,
    );
  });

  it("appears with more than two", () => {
    expect(
      hasOverviewTab({
        ...EMPTY,
        hasPrd: true,
        hasUserFlow: true,
        decisionCount: 2,
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test overview-eligibility`
Expected: FAIL — cannot resolve `./overview-eligibility`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/features/rooms/overview-eligibility.ts`:

```ts
import type { RoomStage } from "@meld/contracts";
import { STAGE_ORDER } from "./stage-readiness";

/**
 * Whether a Room has earned its generated Overview tab.
 *
 * The signals and the two-artifact threshold are carried over verbatim from
 * the retired `getRoomSurfaces`, so a Room that showed an Overview *surface*
 * yesterday shows an Overview *tab* today. Deliberately unchanged: this is a
 * port, not a redesign.
 */
export type RoomArtifactState = {
  hasUserFlow: boolean;
  hasPrd: boolean;
  hasPrdTask: boolean;
  hasBuiltDesignScreen: boolean;
  decisionCount: number;
  stage: RoomStage;
};

const DESIGN_STAGE_INDEX = STAGE_ORDER.indexOf("design");

export function countArtifacts(state: RoomArtifactState): number {
  let count = 0;
  if (state.hasUserFlow) count += 1;
  if (state.hasPrd || state.hasPrdTask) count += 1;
  if (state.decisionCount > 0) count += 1;
  if (
    state.hasBuiltDesignScreen ||
    STAGE_ORDER.indexOf(state.stage) >= DESIGN_STAGE_INDEX
  ) {
    count += 1;
  }
  return count;
}

export function hasOverviewTab(state: RoomArtifactState): boolean {
  return countArtifacts(state) >= 2;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test overview-eligibility`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms/overview-eligibility.ts apps/web/src/features/rooms/overview-eligibility.test.ts
git commit -m "feat(rooms): port artifact counting into overview eligibility"
```

---

## Task 3: Tab resolution from the URL

`?tab=` changes meaning — it now names a tab id. Old links carrying a surface name must keep working for one release.

**Files:**
- Create: `apps/web/src/features/rooms/tab-resolution.ts`
- Test: `apps/web/src/features/rooms/tab-resolution.test.ts`

**Interfaces:**
- Consumes: `PaneTool` from `./pane-layout` (Task 1).
- Produces: `type TabResolution`, `resolveTabParam(requested: unknown, options: { tabIds: readonly string[]; hasOverview: boolean }): TabResolution`.

`TabResolution` is a discriminated union:
- `{ kind: "tab"; tabId: string }` — a known tab id.
- `{ kind: "overview" }` — the generated tab.
- `{ kind: "legacy-tool"; tool: PaneTool }` — an old surface link; the caller opens a fresh tab holding that tool and rewrites the URL.
- `{ kind: "fallback" }` — nothing usable; open the first tab and rewrite the URL.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/rooms/tab-resolution.test.ts`:

```ts
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

  // Conversation is the dock now -- it is on every tab, so an old
  // conversation link just wants the room.
  it("sends the old conversation surface to the first tab", () => {
    expect(resolveTabParam("conversation", WITHOUT_OVERVIEW)).toEqual({
      kind: "fallback",
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test tab-resolution`
Expected: FAIL — cannot resolve `./tab-resolution`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/features/rooms/tab-resolution.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test tab-resolution`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms/tab-resolution.ts apps/web/src/features/rooms/tab-resolution.test.ts
git commit -m "feat(rooms): resolve ?tab= to a tab id, redirecting old surface links"
```

---

## Task 4: The `room_tabs` table

**Files:**
- Create: `supabase/migrations/202608200002_room_tabs.sql`
- Read first: `supabase/migrations/202608120006_room_stage_checklist.sql` (room-scoped RLS shape), `supabase/migrations/202607240004_discovery.sql:168` (`can_edit_room`), `supabase/migrations/202608200001_project_scratch.sql` (column-then-backfill comment style)

**Interfaces:**
- Produces: table `public.room_tabs`; a trigger keeping every Room's first tab; realtime publication membership.

Three invariants must hold or the Room opens to nothing: new Rooms get a tab, existing Rooms get a tab, and the last workstream tab cannot be closed. This migration owns the first two. Task 14 owns the third (UI).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202608200002_room_tabs.sql`:

```sql
-- Tabs are the Room's workstreams. Each holds an ordered list of tools and
-- nothing positional: geometry is derived from the list's length and each
-- tool's index (see apps/web/src/features/rooms/pane-layout.ts), so a layout
-- needs no stored sizes and survives any viewport.
--
-- Row-per-tab rather than a jsonb blob on `rooms`, because two people editing
-- different tabs must not clobber each other. It also gives per-row Realtime
-- for free.
--
-- The generated Overview tab has NO row. It is computed at read time from the
-- Room's artifacts, the way the deck computes STALE.
create table public.room_tabs (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  name        text,
  position    integer not null,
  panes       jsonb not null default '[]'::jsonb,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- `name` is nullable on purpose: a new tab is untitled until the work names
  -- it. An explicitly blank name is a bug, not an untitled tab.
  constraint room_tabs_name_not_blank
    check (name is null or char_length(btrim(name)) between 1 and 80),

  -- Four is the most a tab holds. `insertPaneAt` clamps politely; this is the
  -- honest guard. Every entry must be one of the three known tools, and no
  -- tool may appear twice -- one pane per tool per tab.
  constraint room_tabs_panes_shape check (
    jsonb_typeof(panes) = 'array'
    and jsonb_array_length(panes) <= 4
    and not exists (
      select 1
      from jsonb_array_elements_text(panes) as pane(tool)
      where pane.tool not in ('canvas', 'prototype', 'prd')
    )
    and (
      select count(distinct pane.tool) = jsonb_array_length(panes)
      from jsonb_array_elements_text(panes) as pane(tool)
    )
  )
);

create index room_tabs_room_position on public.room_tabs (room_id, position);

alter table public.room_tabs enable row level security;

revoke all on table public.room_tabs from anon, authenticated;
grant select, insert, update, delete on table public.room_tabs to authenticated;

-- Reading mirrors Room visibility: any participant sees every tab. A
-- view-only participant can switch between tabs; they cannot change them.
create policy "Participants can view room tabs"
on public.room_tabs
for select
to authenticated
using (public.is_room_participant(room_id));

-- Writing mirrors exactly what the database already enforces for other Room
-- writes: can_edit_room, which is participant-with-edit and nothing else --
-- no Room owner bypass and no Workspace administrator bypass.
create policy "Editors can create room tabs"
on public.room_tabs
for insert
to authenticated
with check (public.can_edit_room(room_id) and created_by = auth.uid());

create policy "Editors can change room tabs"
on public.room_tabs
for update
to authenticated
using (public.can_edit_room(room_id))
with check (public.can_edit_room(room_id));

create policy "Editors can close room tabs"
on public.room_tabs
for delete
to authenticated
using (public.can_edit_room(room_id));

-- Backfill: every Room already in the database gets one untitled, empty tab.
-- Existing artifacts are deliberately NOT converted into panes -- opening an
-- old Room gives you the empty plane and you place what you want, which is
-- the entire point of the rebuild. Nothing is lost; the PRD, canvas and
-- prototype are one tap away.
insert into public.room_tabs (room_id, name, position, panes, created_by)
select room.id, null, 0, '[]'::jsonb, room.owner_id
from public.rooms as room;

-- New Rooms get their first tab in the same transaction as the Room, so a
-- Room can never exist without one.
create function public.add_room_first_tab()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.room_tabs (room_id, name, position, panes, created_by)
  values (new.id, null, 0, '[]'::jsonb, new.owner_id);
  return new;
end;
$$;

revoke all on function public.add_room_first_tab() from public, anon, authenticated;

create trigger room_first_tab
after insert on public.rooms
for each row
execute function public.add_room_first_tab();

-- Realtime: a tab another participant adds, renames, reorders or re-lays-out
-- must appear without a reload.
alter publication supabase_realtime add table public.room_tabs;
```

- [ ] **Step 2: Verify the migration applies to a clean database**

Run: `pnpm supabase db reset`
Expected: completes with no error; `202608200002_room_tabs.sql` listed in the applied set.

If `scripts/check-sql-arities.mjs` exists in the repo's check scripts, run it — this migration adds a function with a new signature and may need an entry.

- [ ] **Step 3: Verify the invariants by hand**

Run against the local database:

```bash
pnpm supabase db reset >/dev/null 2>&1
psql "$(pnpm supabase status --output json | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).DB_URL))')" <<'SQL'
-- every existing room has exactly one tab
select count(*) = 0 as every_room_has_one_tab
from public.rooms r
left join public.room_tabs t on t.room_id = r.id
group by r.id
having count(t.id) <> 1;

-- the pane constraint rejects a fifth pane
select public.room_tabs_reject_test();
SQL
```

If the second helper does not exist, verify by attempting an insert with five panes as a service-role client and confirming it raises `room_tabs_panes_shape`. Expected: rejection.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202608200002_room_tabs.sql
git commit -m "feat(rooms): add room_tabs with participant RLS and a first-tab trigger"
```

---

## Task 5: Tab repository and backend methods

**Files:**
- Create: `apps/web/src/features/rooms/room-tabs-repository.ts`
- Create: `apps/web/src/features/rooms/room-tabs-repository.test.ts`
- Modify: `apps/web/src/features/rooms/backend.ts`, `fake-backend.ts`, `supabase-backend.ts`
- Read first: all three backend files — the interface, the in-memory fake, and the Supabase implementation must all gain these methods or the fake-backend tests break.

**Interfaces:**
- Consumes: `PaneLayout`, `PaneTool` from `./pane-layout`.
- Produces:
  - `type RoomTab = { id: string; name: string | null; position: number; panes: PaneLayout }`
  - `listRoomTabs(roomId: string): Promise<RoomTab[]>` — ordered by `position`, then `id`.
  - `createRoomTab(input: { roomId: string; panes?: PaneLayout }): Promise<RoomTab>`
  - `renameRoomTab(input: { tabId: string; name: string | null }): Promise<void>`
  - `setRoomTabPanes(input: { tabId: string; panes: PaneLayout }): Promise<void>`
  - `reorderRoomTabs(input: { roomId: string; orderedTabIds: string[] }): Promise<void>`
  - `closeRoomTab(input: { tabId: string }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/rooms/room-tabs-repository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRoomTabRow, nextTabPosition } from "./room-tabs-repository";

describe("parseRoomTabRow", () => {
  it("reads a well-formed row", () => {
    expect(
      parseRoomTabRow({
        id: "tab-1",
        name: "Checkout",
        position: 2,
        panes: ["canvas", "prd"],
      }),
    ).toEqual({ id: "tab-1", name: "Checkout", position: 2, panes: ["canvas", "prd"] });
  });

  it("keeps an untitled tab untitled", () => {
    const tab = parseRoomTabRow({ id: "t", name: null, position: 0, panes: [] });
    expect(tab.name).toBeNull();
  });

  // The column is jsonb. A row written by an older client, or by hand, must
  // not be able to crash the Room -- an unreadable layout renders as empty.
  it("drops panes that are not known tools", () => {
    const tab = parseRoomTabRow({
      id: "t",
      name: null,
      position: 0,
      panes: ["canvas", "wat", 7, null],
    });
    expect(tab.panes).toEqual(["canvas"]);
  });

  it("drops duplicate panes", () => {
    const tab = parseRoomTabRow({
      id: "t",
      name: null,
      position: 0,
      panes: ["prd", "prd", "canvas"],
    });
    expect(tab.panes).toEqual(["prd", "canvas"]);
  });

  it("clamps to four panes", () => {
    const tab = parseRoomTabRow({
      id: "t",
      name: null,
      position: 0,
      panes: ["canvas", "prototype", "prd", "canvas", "prototype"],
    });
    expect(tab.panes).toHaveLength(3);
  });

  it("treats a non-array layout as empty", () => {
    expect(parseRoomTabRow({ id: "t", name: null, position: 0, panes: null }).panes)
      .toEqual([]);
  });
});

describe("nextTabPosition", () => {
  it("starts at zero for a room with no tabs", () => {
    expect(nextTabPosition([])).toBe(0);
  });

  it("goes after the highest position, not the count", () => {
    expect(nextTabPosition([{ position: 0 }, { position: 5 }])).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test room-tabs-repository`
Expected: FAIL — cannot resolve `./room-tabs-repository`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/features/rooms/room-tabs-repository.ts`. Write `parseRoomTabRow` and `nextTabPosition` as pure exported functions (that is what the test covers), then the Supabase-backed functions beneath them following the client pattern in `repository.ts`:

```ts
import { MAX_PANES, type PaneLayout, type PaneTool } from "./pane-layout";

export type RoomTab = {
  id: string;
  name: string | null;
  position: number;
  panes: PaneLayout;
};

const KNOWN_TOOLS: readonly string[] = ["canvas", "prototype", "prd"];

/**
 * `panes` is jsonb, so the database's shape constraint is the guard for rows
 * this app writes -- but a row written by an older client, or by hand, must
 * never be able to crash a Room. An unreadable layout degrades to a shorter
 * one, or to an empty plane, and the person places what they want again.
 */
export function parseRoomTabRow(row: {
  id: string;
  name: string | null;
  position: number;
  panes: unknown;
}): RoomTab {
  const raw = Array.isArray(row.panes) ? row.panes : [];
  const panes: PaneLayout = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    if (!KNOWN_TOOLS.includes(entry)) continue;
    if (panes.includes(entry as PaneTool)) continue;
    if (panes.length >= MAX_PANES) break;
    panes.push(entry as PaneTool);
  }
  return { id: row.id, name: row.name, position: row.position, panes };
}

/** After the highest position, not the count -- closing a tab leaves gaps. */
export function nextTabPosition(tabs: readonly { position: number }[]): number {
  if (tabs.length === 0) return 0;
  return Math.max(...tabs.map((tab) => tab.position)) + 1;
}
```

Then add `listRoomTabs`, `createRoomTab`, `renameRoomTab`, `setRoomTabPanes`, `reorderRoomTabs` and `closeRoomTab` using the same `supabase.from(...)` shape and the same error-message style as `repository.ts` (user-facing sentences: *"We could not load this room's tabs."*). `reorderRoomTabs` writes `position` as the index in `orderedTabIds`.

- [ ] **Step 4: Add the methods to all three backends**

Add the six method signatures to the `RoomBackend` interface in `backend.ts`, an in-memory implementation to `fake-backend.ts` (storing an array per room, seeded with one untitled empty tab so the fake honours the same invariant as the trigger), and the delegating implementation in `supabase-backend.ts`.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter web test room-tabs-repository && pnpm --filter web typecheck`
Expected: PASS, 8 tests; typecheck clean. Existing fake-backend tests must still pass — run `pnpm --filter web test rooms` to confirm.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/rooms/room-tabs-repository.ts apps/web/src/features/rooms/room-tabs-repository.test.ts apps/web/src/features/rooms/backend.ts apps/web/src/features/rooms/fake-backend.ts apps/web/src/features/rooms/supabase-backend.ts
git commit -m "feat(rooms): read and write room tabs through the room backend"
```

---

# Phase B — Answer the width risk early

## Task 6: Prove the canvas and prototype viewer survive a quadrant

**This task exists to be allowed to fail.** Both components were built for a full surface. At the 1060px reference width a quadrant is roughly 420×260. Everything after this depends on the answer, so it is answered second, not last.

**Files:**
- Create: `apps/web/src/features/rooms/pane-width-probe.test.tsx`
- Read first: `apps/web/src/features/canvas/user-flow-trial-tab-loader.tsx`, `apps/web/src/features/design/components/prototype-viewer.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a written finding, and either a green light or a changed layout rule.

- [ ] **Step 1: Write a probe that renders each component in a quadrant-sized box**

Create `apps/web/src/features/rooms/pane-width-probe.test.tsx`. Render the prototype viewer and the canvas tab inside a container fixed at the quadrant size, with whatever minimal props each needs (read the components to find them; use the fake backend where a loader wants data). Assert only that each mounts without throwing and produces non-empty output.

```tsx
// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

afterEach(cleanup);

// The quadrant at the 1060px reference width, in CSS pixels. This test file
// is a probe, not shipped UI, so raw numbers here are fine -- it is excluded
// from the token convention check by living outside src/ui and src/features
// component paths only if the checker complains; if it does, move these into
// a local constant object rather than inline styles.
const QUADRANT = { width: 420, height: 260 };

it("mounts the prototype viewer at quadrant size", () => {
  const { container } = render(
    <div style={QUADRANT}>{/* <PrototypeViewer ...minimal props /> */}</div>,
  );
  expect(container.firstChild).not.toBeNull();
});
```

Replace the comment with the real component and its minimum viable props. If a component cannot be mounted in jsdom at all (canvas APIs, ResizeObserver), that is itself the finding — record it and move to Step 2 using a Playwright probe instead.

- [ ] **Step 2: Look at it in a real browser**

Run the app (`pnpm --filter web dev`), open an existing Room with a built prototype and a canvas, and use devtools to force the surface to 420×260. Judge, with eyes:

- Is the canvas usable — can you see a frame and select it?
- Is the prototype viewer usable — is the screen legible, are the controls reachable?
- What is the smallest size at which each stops being usable?

- [ ] **Step 3: Write the finding down and decide**

Append a short "Width probe" section to `docs/superpowers/specs/2026-08-20-room-freeform-canvas-design.md` under Risks, recording what you found and the decision:

- **Both usable at a quadrant** → no change. Continue to Task 7.
- **One or both unusable** → adopt a **minimum region**: that tool declares `minimumRegion: "half"`, `regionsFor` is unaffected, but `canPlace` gains a rule that placing a half-minimum tool into a layout that would quarter it is refused, with the toolbar row showing the reason. **Update Task 1's `canPlace` and its tests in this same commit**, and note the change here so later tasks see it.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-20-room-freeform-canvas-design.md apps/web/src/features/rooms/
git commit -m "test(rooms): probe canvas and prototype viewer at quadrant width"
```

- [ ] **Step 5: Report before continuing**

This task's finding changes the tasks after it. Report it to the reviewer before starting Task 7.

---

# Phase C — Meld primitives

Every task in this phase follows the same shape: a `.tsx`, a `.module.css`, a `.test.tsx`, and a `COMPONENTS.md` entry in the same commit. Read `apps/web/src/ui/meld/kind-chip.tsx` and `text-input.tsx` first — the former for the `data-*` reflection pattern, the latter for the frame-layer technique that gives a clipped element a visible edge.

## Task 7: `MeldPlane`

**Files:**
- Create: `apps/web/src/ui/meld/plane.tsx`, `apps/web/src/ui/meld/plane.module.css`, `apps/web/src/ui/meld/plane.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `MeldPlane({ children, toolbar, dock }: { children: ReactNode; toolbar?: ReactNode; dock?: ReactNode })`.

The plane is the dot-field work surface. It is a 2×2 CSS grid; panes place themselves into it by grid line. The toolbar floats at its top-left and the dock pins to its bottom — both are slots, so the plane does not know what they are.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/ui/meld/plane.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldPlane } from "./plane";

afterEach(cleanup);

it("renders the panes it is given", () => {
  render(<MeldPlane><span>a pane</span></MeldPlane>);

  expect(screen.getByText("a pane")).toBeInTheDocument();
});

it("renders the toolbar slot", () => {
  render(<MeldPlane toolbar={<span>tools</span>}>{null}</MeldPlane>);

  expect(screen.getByText("tools")).toBeInTheDocument();
});

it("renders the dock slot", () => {
  render(<MeldPlane dock={<span>dock</span>}>{null}</MeldPlane>);

  expect(screen.getByText("dock")).toBeInTheDocument();
});

it("marks the pane grid for stable targeting", () => {
  render(<MeldPlane>{null}</MeldPlane>);

  expect(screen.getByTestId("plane-grid")).toHaveAttribute(
    "data-pane-grid",
    "true",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test ui/meld/plane`
Expected: FAIL — cannot resolve `./plane`.

- [ ] **Step 3: Write the implementation**

`plane.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./plane.module.css";

/**
 * The Room's work surface: a dot field on the 24px grid holding a 2x2 pane
 * grid, with the toolbar floating at its top-left and the dock pinned to its
 * bottom.
 *
 * Both are slots. The plane does not know what a toolbar or a dock is, which
 * is what lets the Overview tab render one without the other.
 */
export function MeldPlane({
  children,
  toolbar,
  dock,
}: {
  children: ReactNode;
  toolbar?: ReactNode;
  dock?: ReactNode;
}) {
  return (
    <div className={styles.plane}>
      <div className={styles.grid} data-pane-grid="true" data-testid="plane-grid">
        {children}
      </div>
      {toolbar ? <div className={styles.toolbar}>{toolbar}</div> : null}
      {dock ? <div className={styles.dock}>{dock}</div> : null}
    </div>
  );
}
```

`plane.module.css` — the dot field matches `MeldPixelField`/`MeldDeckFrame`; read `pixel-field.module.css` and reuse its background declaration rather than inventing a second dot field:

```css
.plane {
  position: relative;
  flex: 1;
  min-height: 0;
  background-color: var(--meld-surface-wash);
  /* Match MeldPixelField's dot field exactly -- two different dot grids on
   * one screen read as a mistake. */
  background-image: radial-gradient(var(--meld-line) var(--meld-hairline), transparent var(--meld-hairline));
  background-size: var(--meld-space-6) var(--meld-space-6);
}

.grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: var(--meld-space-2);
  padding: var(--meld-space-2);
}

.toolbar {
  position: absolute;
  inset-inline-start: var(--meld-space-3);
  inset-block-start: var(--meld-space-3);
  z-index: 3;
}

.dock {
  position: absolute;
  inset-inline: var(--meld-space-3);
  inset-block-end: var(--meld-space-3);
  z-index: 2;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test ui/meld/plane`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the `COMPONENTS.md` entry and commit**

Add a `### MeldPlane — plane.tsx` section in the same style as the existing entries, with the props table.

```bash
git add apps/web/src/ui/meld/plane.tsx apps/web/src/ui/meld/plane.module.css apps/web/src/ui/meld/plane.test.tsx apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): add MeldPlane, the room's dot-field work surface"
```

---

## Task 8: `MeldPane`

**Files:**
- Create: `apps/web/src/ui/meld/pane.tsx`, `pane.module.css`, `pane.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: `PaneRegion` from `@/features/rooms/pane-layout` (Task 1), imported as a **type-only** import and re-exported as `MeldPaneRegion`.
- Produces: `MeldPane({ title, region, isFocused, onClose, onPopOut, children })`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/ui/meld/pane.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MeldPane } from "./pane";

afterEach(cleanup);

const REGION = {
  columnStart: 1,
  columnEnd: 2,
  rowStart: 1,
  rowEnd: 3,
} as const;

it("names the pane by its tool", () => {
  render(
    <MeldPane title="PRD" region={REGION} onClose={() => {}} onPopOut={() => {}}>
      <span>body</span>
    </MeldPane>,
  );

  expect(screen.getByRole("region", { name: "PRD" })).toBeInTheDocument();
  expect(screen.getByText("body")).toBeInTheDocument();
});

it("places itself on the plane's grid", () => {
  render(
    <MeldPane title="PRD" region={REGION} onClose={() => {}} onPopOut={() => {}}>
      {null}
    </MeldPane>,
  );

  const pane = screen.getByRole("region", { name: "PRD" });
  expect(pane).toHaveStyle({ gridColumnStart: "1", gridRowEnd: "3" });
});

it("reflects focus for stable targeting", () => {
  render(
    <MeldPane title="PRD" region={REGION} isFocused onClose={() => {}} onPopOut={() => {}}>
      {null}
    </MeldPane>,
  );

  expect(screen.getByRole("region", { name: "PRD" })).toHaveAttribute(
    "data-focused",
    "true",
  );
});

it("closes when asked", async () => {
  const onClose = vi.fn();
  render(
    <MeldPane title="PRD" region={REGION} onClose={onClose} onPopOut={() => {}}>
      {null}
    </MeldPane>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Close PRD" }));

  expect(onClose).toHaveBeenCalledOnce();
});

it("pops out to a new tab when asked", async () => {
  const onPopOut = vi.fn();
  render(
    <MeldPane title="PRD" region={REGION} onClose={() => {}} onPopOut={onPopOut}>
      {null}
    </MeldPane>,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Open PRD in a new tab" }),
  );

  expect(onPopOut).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test ui/meld/pane`
Expected: FAIL — cannot resolve `./pane`.

- [ ] **Step 3: Write the implementation**

`pane.tsx` — the edge uses the frame-layer technique (a filled clipped outer wrapping a clipped inner), **not** a border and **not** a shadow:

```tsx
import type { ReactNode } from "react";
import type { PaneRegion } from "@/features/rooms/pane-layout";
import { PixelX, PixelChevronRight } from "@/ui/pixel-icons";
import styles from "./pane.module.css";

export type MeldPaneRegion = PaneRegion;

/**
 * One framed pane on the plane.
 *
 * The ink edge is a frame layer, not a border: `clip-path` slices a border
 * into a rectangular ring that stops dead at each corner step. A filled,
 * clipped outer with one step of padding, holding a clipped inner, gives an
 * edge that follows the staircase. `MeldTextInput` does the same.
 */
export function MeldPane({
  title,
  region,
  isFocused = false,
  onClose,
  onPopOut,
  children,
}: {
  title: string;
  region: MeldPaneRegion;
  isFocused?: boolean;
  onClose: () => void;
  onPopOut: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={styles.frame}
      aria-label={title}
      data-focused={isFocused ? "true" : "false"}
      style={{
        gridColumnStart: region.columnStart,
        gridColumnEnd: region.columnEnd,
        gridRowStart: region.rowStart,
        gridRowEnd: region.rowEnd,
      }}
    >
      <div className={styles.pane}>
        <header className={styles.head}>
          <span className={styles.title}>{title}</span>
          <span className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={onPopOut}
              aria-label={`Open ${title} in a new tab`}
            >
              <PixelChevronRight pack="basic" size="sm" />
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={onClose}
              aria-label={`Close ${title}`}
            >
              <PixelX pack="basic" size="sm" />
            </button>
          </span>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </section>
  );
}
```

`pane.module.css`:

```css
.frame {
  min-width: 0;
  min-height: 0;
  background-color: var(--meld-line-strong);
  padding: var(--meld-pixel-step);
  clip-path: var(--meld-pixel-corner);
}

.frame[data-focused="true"] {
  background-color: var(--meld-accent);
}

.pane {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-width: 0;
  background-color: var(--meld-surface);
  clip-path: var(--meld-pixel-corner);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--meld-space-2);
  padding: var(--meld-space-1) var(--meld-space-2);
  border-block-end: var(--meld-hairline) solid var(--meld-line);
}

.title {
  font-family: var(--meld-font-pixel);
  font-size: var(--meld-text-xs);
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--meld-text-muted);
}

.actions {
  display: flex;
  gap: var(--meld-space-1);
}

.action {
  display: grid;
  place-items: center;
  padding: var(--meld-space-1);
  color: var(--meld-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  clip-path: var(--meld-pixel-corner);
}

.action:hover {
  color: var(--meld-text);
  background-color: var(--meld-surface-sunken);
}

/* clip-path erases outline, so the focus ring must be an inset shadow --
 * which follows the stepped edge for free. */
.action:focus-visible {
  box-shadow: inset 0 0 0 var(--meld-hairline) var(--meld-accent);
  outline: none;
}

.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test ui/meld/pane`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the `COMPONENTS.md` entry and commit**

```bash
git add apps/web/src/ui/meld/pane.tsx apps/web/src/ui/meld/pane.module.css apps/web/src/ui/meld/pane.test.tsx apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): add MeldPane with a frame-layer edge"
```

---

## Task 9: `MeldToolbar`

**Files:**
- Create: `apps/web/src/ui/meld/toolbar.tsx`, `toolbar.module.css`, `toolbar.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: nothing from earlier tasks. Icons from `@/ui/pixel-icons`.
- Produces:
  - `type MeldToolbarItemState = "idle" | "open" | "active"`
  - `MeldToolbar({ isCollapsed, onCollapsedChange, children })`
  - `MeldToolbarItem({ label, icon, state, isDisabled, disabledReason, onSelect, onDragStart })`

Three row states, and they must be distinct: `idle` (no pane), `open` (a pane exists — accent pip), `active` (owns the focused pane — ink fill, white label, pixel corner, **not** a rounded pill).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/ui/meld/toolbar.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PixelClipboard } from "@/ui/pixel-icons";
import { MeldToolbar, MeldToolbarItem } from "./toolbar";

afterEach(cleanup);

function renderToolbar(props: Partial<Parameters<typeof MeldToolbarItem>[0]> = {}) {
  return render(
    <MeldToolbar isCollapsed={false} onCollapsedChange={() => {}}>
      <MeldToolbarItem
        label="PRD"
        icon={<PixelClipboard pack="basic" size="sm" />}
        state="idle"
        onSelect={() => {}}
        {...props}
      />
    </MeldToolbar>,
  );
}

it("shows the label when open", () => {
  renderToolbar();

  expect(screen.getByRole("button", { name: "PRD" })).toBeInTheDocument();
});

it.each(["idle", "open", "active"] as const)(
  "reflects the %s state for stable targeting",
  (state) => {
    renderToolbar({ state });

    expect(screen.getByRole("button", { name: "PRD" })).toHaveAttribute(
      "data-state",
      state,
    );
  },
);

it("places the tool when pressed", async () => {
  const onSelect = vi.fn();
  renderToolbar({ onSelect });

  await userEvent.click(screen.getByRole("button", { name: "PRD" }));

  expect(onSelect).toHaveBeenCalledOnce();
});

it("places the tool from the keyboard", async () => {
  const onSelect = vi.fn();
  renderToolbar({ onSelect });

  screen.getByRole("button", { name: "PRD" }).focus();
  await userEvent.keyboard("{Enter}");

  expect(onSelect).toHaveBeenCalledOnce();
});

it("explains why a tool cannot be placed", () => {
  renderToolbar({
    isDisabled: true,
    disabledReason: "Four is the most a tab holds.",
  });

  const item = screen.getByRole("button", { name: "PRD" });
  expect(item).toBeDisabled();
  expect(item).toHaveAccessibleDescription("Four is the most a tab holds.");
});

it("keeps the label available to assistive tech when collapsed", () => {
  render(
    <MeldToolbar isCollapsed onCollapsedChange={() => {}}>
      <MeldToolbarItem
        label="PRD"
        icon={<PixelClipboard pack="basic" size="sm" />}
        state="idle"
        onSelect={() => {}}
      />
    </MeldToolbar>,
  );

  expect(screen.getByRole("button", { name: "PRD" })).toBeInTheDocument();
});

it("collapses and expands", async () => {
  const onCollapsedChange = vi.fn();
  render(
    <MeldToolbar isCollapsed={false} onCollapsedChange={onCollapsedChange}>
      {null}
    </MeldToolbar>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Collapse toolbar" }));

  expect(onCollapsedChange).toHaveBeenCalledWith(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test ui/meld/toolbar`
Expected: FAIL — cannot resolve `./toolbar`.

- [ ] **Step 3: Write the implementation**

`toolbar.tsx`. Key points: the collapse control uses `PixelChevronLeft` / `PixelChevronRight`; when collapsed the label is visually hidden but still the accessible name (a `visually-hidden` span, not `aria-label`, so the name and the visible text never disagree); rows carry `draggable` and forward `onDragStart`; disabled rows get `aria-describedby` pointing at the reason.

`toolbar.module.css`. The panel uses the frame-layer technique like `MeldPane`. **No shadow.** The three states:

```css
.item[data-state="idle"] {
  color: var(--meld-text);
  background-color: transparent;
}

/* A pane exists for this tool: a pip, not a fill. */
.item[data-state="open"]::before {
  content: "";
  position: absolute;
  inset-inline-start: 0;
  inline-size: var(--meld-space-1);
  block-size: var(--meld-space-1);
  background-color: var(--meld-accent);
}

/* Owns the focused pane. Ink fill with the pixel corner -- not a pill. */
.item[data-state="active"] {
  color: var(--meld-white);
  background-color: var(--meld-text);
  clip-path: var(--meld-pixel-corner);
}

.item:focus-visible {
  box-shadow: inset 0 0 0 var(--meld-hairline) var(--meld-accent);
  outline: none;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test ui/meld/toolbar`
Expected: PASS, 11 tests.

- [ ] **Step 5: Add the `COMPONENTS.md` entry and commit**

```bash
git add apps/web/src/ui/meld/toolbar.tsx apps/web/src/ui/meld/toolbar.module.css apps/web/src/ui/meld/toolbar.test.tsx apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): add MeldToolbar with idle, open and active rows"
```

---

## Task 10: `MeldTabStrip`

**Files:**
- Create: `apps/web/src/ui/meld/tab-strip.tsx`, `tab-strip.module.css`, `tab-strip.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `MeldTabStrip({ activeTabId, onActivate, onAdd, onDropOnAdd, presence, children })`
  - `MeldTab({ tabId, label, variant, isClosable, onRename, onClose })` where `variant` is `"workstream" | "generated"`.

A real `tablist` / `tab` / `tabpanel` relationship, arrow-key navigable. The generated Overview tab is `variant="generated"` — accent-outlined, not renameable, not closable, not reorderable.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/ui/meld/tab-strip.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MeldTab, MeldTabStrip } from "./tab-strip";

afterEach(cleanup);

function renderStrip(overrides: { onActivate?: () => void; onAdd?: () => void } = {}) {
  return render(
    <MeldTabStrip
      activeTabId="checkout"
      onActivate={overrides.onActivate ?? (() => {})}
      onAdd={overrides.onAdd ?? (() => {})}
    >
      <MeldTab tabId="overview" label="Overview" variant="generated" />
      <MeldTab tabId="checkout" label="Checkout" variant="workstream" isClosable />
      <MeldTab tabId="empty" label="Empty states" variant="workstream" isClosable />
    </MeldTabStrip>,
  );
}

it("is a tablist with the active tab selected", () => {
  renderStrip();

  expect(screen.getByRole("tablist")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Checkout" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "false",
  );
});

it("marks the generated tab so it reads as built, not placed", () => {
  renderStrip();

  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "data-variant",
    "generated",
  );
});

it("activates a tab when pressed", async () => {
  const onActivate = vi.fn();
  renderStrip({ onActivate });

  await userEvent.click(screen.getByRole("tab", { name: "Empty states" }));

  expect(onActivate).toHaveBeenCalledWith("empty");
});

it("moves between tabs with arrow keys", async () => {
  renderStrip();

  screen.getByRole("tab", { name: "Checkout" }).focus();
  await userEvent.keyboard("{ArrowRight}");

  expect(screen.getByRole("tab", { name: "Empty states" })).toHaveFocus();
});

it("starts a new tab", async () => {
  const onAdd = vi.fn();
  renderStrip({ onAdd });

  await userEvent.click(screen.getByRole("button", { name: "New tab" }));

  expect(onAdd).toHaveBeenCalledOnce();
});

it("gives the generated tab no close control", () => {
  renderStrip();

  expect(screen.queryByRole("button", { name: "Close Overview" })).toBeNull();
  expect(screen.getByRole("button", { name: "Close Checkout" })).toBeInTheDocument();
});

it("renders the presence slot", () => {
  render(
    <MeldTabStrip
      activeTabId="a"
      onActivate={() => {}}
      onAdd={() => {}}
      presence={<span>who is here</span>}
    >
      <MeldTab tabId="a" label="A" variant="workstream" />
    </MeldTabStrip>,
  );

  expect(screen.getByText("who is here")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test ui/meld/tab-strip`
Expected: FAIL — cannot resolve `./tab-strip`.

- [ ] **Step 3: Write the implementation**

`tab-strip.tsx`. Roving tabindex: only the active tab has `tabIndex={0}`, the rest `tabIndex={-1}`; `ArrowLeft`/`ArrowRight` move focus and wrap; `Home`/`End` jump to the ends. The `+` is a `button` with the accessible name `New tab`, and accepts `onDragOver`/`onDrop` so a tool dragged onto it opens a new tab (wired in Task 17). Rename is double-click turning the label into an input; commit on `Enter`/blur, cancel on `Escape`.

`tab-strip.module.css`. Active tab: `--meld-surface` with an inset ink ring. Generated tab: `--meld-accent-surface` with an inset `--meld-accent` ring and `--meld-text-on-accent`. Labels are Archivo; only the tab's count/status metadata may use Pixelify.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test ui/meld/tab-strip`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the `COMPONENTS.md` entry and commit**

```bash
git add apps/web/src/ui/meld/tab-strip.tsx apps/web/src/ui/meld/tab-strip.module.css apps/web/src/ui/meld/tab-strip.test.tsx apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): add MeldTabStrip with a pinned generated tab"
```

---

## Task 11: `MeldDock`

**Files:**
- Create: `apps/web/src/ui/meld/dock.tsx`, `dock.module.css`, `dock.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: nothing from earlier tasks. Read `apps/web/src/ui/meld/console.tsx` — the at-rest line must match `MeldConsoleSearch`, so the Room and the Deck share one way of talking to the product.
- Produces: `MeldDock({ isExpanded, onExpandedChange, composer, children })`.

At rest: one composer line. Expanded: grows upward over the plane to at most 60% of plane height, overlaying panes rather than reflowing them.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/ui/meld/dock.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MeldDock } from "./dock";

afterEach(cleanup);

it("shows only the composer at rest", () => {
  render(
    <MeldDock
      isExpanded={false}
      onExpandedChange={() => {}}
      composer={<span>ask anything</span>}
    >
      <span>the transcript</span>
    </MeldDock>,
  );

  expect(screen.getByText("ask anything")).toBeInTheDocument();
  expect(screen.queryByText("the transcript")).toBeNull();
});

it("shows the conversation when expanded", () => {
  render(
    <MeldDock
      isExpanded
      onExpandedChange={() => {}}
      composer={<span>ask anything</span>}
    >
      <span>the transcript</span>
    </MeldDock>,
  );

  expect(screen.getByText("the transcript")).toBeInTheDocument();
});

it("tells assistive tech whether it is open", () => {
  render(
    <MeldDock isExpanded={false} onExpandedChange={() => {}} composer={null}>
      {null}
    </MeldDock>,
  );

  expect(screen.getByRole("button", { name: "Show conversation" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

it("expands when asked", async () => {
  const onExpandedChange = vi.fn();
  render(
    <MeldDock
      isExpanded={false}
      onExpandedChange={onExpandedChange}
      composer={null}
    >
      {null}
    </MeldDock>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Show conversation" }));

  expect(onExpandedChange).toHaveBeenCalledWith(true);
});

it("collapses on Escape", async () => {
  const onExpandedChange = vi.fn();
  render(
    <MeldDock isExpanded onExpandedChange={onExpandedChange} composer={null}>
      {null}
    </MeldDock>,
  );

  await userEvent.keyboard("{Escape}");

  expect(onExpandedChange).toHaveBeenCalledWith(false);
});

it("reflects its state for stable targeting", () => {
  render(
    <MeldDock isExpanded onExpandedChange={() => {}} composer={null}>
      {null}
    </MeldDock>,
  );

  expect(screen.getByTestId("dock")).toHaveAttribute("data-expanded", "true");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test ui/meld/dock`
Expected: FAIL — cannot resolve `./dock`.

- [ ] **Step 3: Write the implementation**

`dock.tsx`. The `Escape` handler is a `useEffect` keydown listener on `document`, registered only while expanded. Expanding moves focus into the composer.

`dock.module.css`. The frame-layer technique for the edge, **no shadow**. The expanded body is `max-block-size: 60%` of the plane — expressed as a percentage, not a pixel value. Since the dock is absolutely positioned inside `MeldPlane`, `60%` resolves against the plane.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test ui/meld/dock`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the `COMPONENTS.md` entry and commit**

```bash
git add apps/web/src/ui/meld/dock.tsx apps/web/src/ui/meld/dock.module.css apps/web/src/ui/meld/dock.test.tsx apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): add MeldDock, the room's always-present conversation band"
```

---

## Task 12: `MeldDropZone`

**Files:**
- Create: `apps/web/src/ui/meld/drop-zone.tsx`, `drop-zone.module.css`, `drop-zone.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: `MeldPaneRegion` from `./pane` (Task 8).
- Produces: `MeldDropZone({ region, label, isActive, onDragEnter, onDragOver, onDrop })`.

**Colour is never the only signal.** The active zone gains a heavier inset edge as well as the accent fill.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/ui/meld/drop-zone.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldDropZone } from "./drop-zone";

afterEach(cleanup);

const REGION = { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 3 } as const;

it("names the region it would fill", () => {
  render(
    <MeldDropZone region={REGION} label="Open PRD on the right half" isActive={false} />,
  );

  expect(
    screen.getByRole("presentation", { name: "Open PRD on the right half" }),
  ).toBeInTheDocument();
});

it("places itself on the plane's grid", () => {
  render(<MeldDropZone region={REGION} label="right half" isActive={false} />);

  expect(screen.getByTestId("drop-zone")).toHaveStyle({ gridColumnStart: "2" });
});

it("reflects the active zone for stable targeting", () => {
  render(<MeldDropZone region={REGION} label="right half" isActive />);

  expect(screen.getByTestId("drop-zone")).toHaveAttribute("data-active", "true");
});

it("is inactive by default", () => {
  render(<MeldDropZone region={REGION} label="right half" isActive={false} />);

  expect(screen.getByTestId("drop-zone")).toHaveAttribute("data-active", "false");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test ui/meld/drop-zone`
Expected: FAIL — cannot resolve `./drop-zone`.

- [ ] **Step 3: Write the implementation**

```tsx
import type { MeldPaneRegion } from "./pane";
import styles from "./drop-zone.module.css";

/**
 * A candidate region while a tool is being dragged.
 *
 * The label is the sentence the plane's aria-live region announces, so it is
 * written as one -- "Open PRD on the right half", not "right".
 */
export function MeldDropZone({
  region,
  label,
  isActive,
  onDragEnter,
  onDragOver,
  onDrop,
}: {
  region: MeldPaneRegion;
  label: string;
  isActive: boolean;
  onDragEnter?: () => void;
  onDragOver?: (event: React.DragEvent) => void;
  onDrop?: () => void;
}) {
  return (
    <div
      role="presentation"
      aria-label={label}
      data-testid="drop-zone"
      data-active={isActive ? "true" : "false"}
      className={styles.zone}
      style={{
        gridColumnStart: region.columnStart,
        gridColumnEnd: region.columnEnd,
        gridRowStart: region.rowStart,
        gridRowEnd: region.rowEnd,
      }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
    />
  );
}
```

```css
.zone {
  min-width: 0;
  min-height: 0;
  clip-path: var(--meld-pixel-corner);
  box-shadow: inset 0 0 0 var(--meld-hairline) var(--meld-line);
  background-color: transparent;
}

/* Colour is never the only signal: the active zone also takes a heavier
 * edge, so it reads as chosen without relying on hue. */
.zone[data-active="true"] {
  background-color: var(--meld-accent-surface);
  box-shadow: inset 0 0 0 var(--meld-pixel-step) var(--meld-accent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test ui/meld/drop-zone`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the `COMPONENTS.md` entry and commit**

```bash
git add apps/web/src/ui/meld/drop-zone.tsx apps/web/src/ui/meld/drop-zone.module.css apps/web/src/ui/meld/drop-zone.test.tsx apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): add MeldDropZone with a non-colour-only active state"
```

---

# Phase D — Wire the shell

## Task 13: Map a tool to its component

**Files:**
- Create: `apps/web/src/features/rooms/components/pane-content.tsx`
- Test: `apps/web/src/features/rooms/components/pane-content.test.tsx`
- Read first: how `page.tsx` currently constructs `UserFlowTrialTab`, `PrototypeViewer` and `PrdDocument`, including every prop each needs.

**Interfaces:**
- Consumes: `PaneTool` from `../pane-layout`.
- Produces:
  - `type PaneContentProps = { tool: PaneTool; data: RoomPaneData }` where `RoomPaneData` carries the per-tool props the server loaded.
  - `PANE_TITLES: Record<PaneTool, string>` — `{ canvas: "Canvas", prototype: "Prototype", prd: "PRD" }`.
  - `PaneContent({ tool, data })`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PANE_TITLES, PaneContent } from "./pane-content";

vi.mock("@/features/design/components/prototype-viewer", () => ({
  PrototypeViewer: () => <span>prototype viewer</span>,
}));
vi.mock("@/features/prd/components/prd-document", () => ({
  PrdDocument: () => <span>prd document</span>,
}));
vi.mock("@/features/canvas/user-flow-trial-tab-loader", () => ({
  UserFlowTrialTab: () => <span>canvas</span>,
}));

afterEach(cleanup);

it("titles each tool", () => {
  expect(PANE_TITLES).toEqual({
    canvas: "Canvas",
    prototype: "Prototype",
    prd: "PRD",
  });
});

it("renders the PRD document for the prd tool", () => {
  render(<PaneContent tool="prd" data={{ prd: null, prototype: null, canvas: null }} />);

  expect(screen.getByText("prd document")).toBeInTheDocument();
});

it("renders the prototype viewer for the prototype tool", () => {
  render(<PaneContent tool="prototype" data={{ prd: null, prototype: null, canvas: null }} />);

  expect(screen.getByText("prototype viewer")).toBeInTheDocument();
});

it("renders the canvas for the canvas tool", () => {
  render(<PaneContent tool="canvas" data={{ prd: null, prototype: null, canvas: null }} />);

  expect(screen.getByText("canvas")).toBeInTheDocument();
});

// A pane whose artifact does not exist yet is the normal case in a new Room:
// you place PRD before there is a PRD. It must invite, not error.
it("invites you to start when the artifact does not exist", () => {
  render(<PaneContent tool="prd" data={{ prd: undefined, prototype: null, canvas: null }} />);

  expect(screen.getByText(/no PRD yet/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test pane-content`
Expected: FAIL — cannot resolve `./pane-content`.

- [ ] **Step 3: Write the implementation**

Compose only Meld primitives and existing feature components — **no raw `<div>`**, this is feature code. Use `MeldRegion` / `MeldStack` for the empty states and `MeldButton` for the invitation ("Ask meld to draft one" focuses the dock composer).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test pane-content`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms/components/pane-content.tsx apps/web/src/features/rooms/components/pane-content.test.tsx
git commit -m "feat(rooms): map a pane tool to its existing surface component"
```

---

## Task 14: The Room shell, wired for tap-to-place

The Room is usable at the end of this task. Drag comes in Task 17.

**Files:**
- Create: `apps/web/src/features/rooms/components/room-plane.tsx`
- Test: `apps/web/src/features/rooms/components/room-plane.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1, 5, 7–13.
- Produces: `RoomPlane({ roomId, tabs, activeTabId, hasOverview, canEdit, paneData, conversation })`.

Behaviour this task owns:
- Tap a toolbar row → `insertPaneAt(panes, tool, panes.length)`, persisted with `setRoomTabPanes`.
- Tap an already-open tool → focus its pane, no write.
- A tool that cannot be placed → its row is disabled with the reason. Two reasons exist: *"Already open in this tab."* (the common one — press it to focus instead) and *"Four is the most a tab holds. Close one, or drop this on + for a new tab."* (unreachable with three tools; ships as headroom).
- Close a pane → `removePane`, persisted.
- Pop out a pane → `createRoomTab({ roomId, panes: [tool] })`, then activate it.
- **The last workstream tab has no close control.** Overview does not count toward this.
- A view-only participant (`canEdit === false`) gets no create, rename, close, or place controls, and the toolbar is absent.
- Toolbar collapsed and dock expanded persist in `localStorage`, keyed per user; they are personal preferences, not Room state.
- Keyboard: `Ctrl/Cmd+1…4` focus a pane, `Ctrl/Cmd+W` close the focused pane, `Ctrl/Cmd+T` new tab, `Ctrl/Cmd+K` focus the dock composer, `Escape` collapses the dock.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/rooms/components/room-plane.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoomPlane } from "./room-plane";

const setRoomTabPanes = vi.fn();
const createRoomTab = vi.fn();

vi.mock("../room-tabs-repository", async () => {
  const actual = await vi.importActual<typeof import("../room-tabs-repository")>(
    "../room-tabs-repository",
  );
  return {
    ...actual,
    setRoomTabPanes: (...args: unknown[]) => setRoomTabPanes(...args),
    createRoomTab: (...args: unknown[]) => {
      createRoomTab(...args);
      return Promise.resolve({ id: "tab-new", name: null, position: 1, panes: ["prd"] });
    },
  };
});

// The pane's body is somebody else's problem here -- this file is about
// placement, not about what a PRD looks like.
vi.mock("./pane-content", () => ({
  PANE_TITLES: { canvas: "Canvas", prototype: "Prototype", prd: "PRD" },
  PaneContent: ({ tool }: { tool: string }) => <span>{`${tool} body`}</span>,
}));

afterEach(cleanup);
beforeEach(() => {
  setRoomTabPanes.mockClear();
  createRoomTab.mockClear();
  window.localStorage.clear();
});

const EMPTY_PANE_DATA = { prd: null, prototype: null, canvas: null };

function renderPlane(overrides: Partial<Parameters<typeof RoomPlane>[0]> = {}) {
  return render(
    <RoomPlane
      roomId="room-1"
      tabs={[{ id: "tab-1", name: "Checkout", position: 0, panes: [] }]}
      activeTabId="tab-1"
      hasOverview={false}
      canEdit
      paneData={EMPTY_PANE_DATA}
      conversation={<span>the conversation</span>}
      {...overrides}
    />,
  );
}

it("places a tool in the first free region when its row is pressed", async () => {
  renderPlane();

  await userEvent.click(screen.getByRole("button", { name: "PRD" }));

  expect(screen.getByRole("region", { name: "PRD" })).toBeInTheDocument();
  expect(setRoomTabPanes).toHaveBeenCalledWith({
    tabId: "tab-1",
    panes: ["prd"],
  });
});

it("focuses an already-open tool instead of opening it twice", async () => {
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prd"] }],
  });

  await userEvent.click(screen.getByRole("button", { name: "PRD" }));

  expect(screen.getAllByRole("region", { name: "PRD" })).toHaveLength(1);
  expect(screen.getByRole("region", { name: "PRD" })).toHaveAttribute(
    "data-focused",
    "true",
  );
  expect(setRoomTabPanes).not.toHaveBeenCalled();
});

it("disables the toolbar at four panes and says why", () => {
  renderPlane({
    tabs: [
      {
        id: "tab-1",
        name: "Checkout",
        position: 0,
        panes: ["canvas", "prototype", "prd"],
      },
    ],
  });

  // Three tools exist, so a full tab is three panes -- the fourth slot can
  // only be filled by a tool that is already open, which canPlace refuses.
  const row = screen.getByRole("button", { name: "Canvas" });
  expect(row).toBeDisabled();
  expect(row).toHaveAccessibleDescription(/already open in this tab/i);
});

it("closes a pane and reflows the rest", async () => {
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  await userEvent.click(screen.getByRole("button", { name: "Close Canvas" }));

  expect(screen.queryByRole("region", { name: "Canvas" })).toBeNull();
  expect(setRoomTabPanes).toHaveBeenCalledWith({
    tabId: "tab-1",
    panes: ["prd"],
  });
});

it("pops a pane out into a new tab holding only that tool", async () => {
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  await userEvent.click(
    screen.getByRole("button", { name: "Open PRD in a new tab" }),
  );

  expect(createRoomTab).toHaveBeenCalledWith({
    roomId: "room-1",
    panes: ["prd"],
  });
});

it("gives a view-only participant no toolbar and no close controls", () => {
  renderPlane({
    canEdit: false,
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prd"] }],
  });

  expect(screen.queryByRole("button", { name: "PRD" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Close PRD" })).toBeNull();
  expect(screen.queryByRole("button", { name: "New tab" })).toBeNull();
  // They can still read it and still switch tabs.
  expect(screen.getByRole("region", { name: "PRD" })).toBeInTheDocument();
});

it("hides the close control on the last workstream tab", () => {
  renderPlane({ hasOverview: true });

  // Overview does not count: a room whose only tab is Overview has nowhere
  // to work.
  expect(screen.queryByRole("button", { name: "Close Checkout" })).toBeNull();
});

it("offers a close control once a second workstream tab exists", () => {
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: [] },
      { id: "tab-2", name: "Empty states", position: 1, panes: [] },
    ],
  });

  expect(
    screen.getByRole("button", { name: "Close Checkout" }),
  ).toBeInTheDocument();
});

it("keeps the same conversation when the tab changes", async () => {
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: [] },
      { id: "tab-2", name: "Empty states", position: 1, panes: [] },
    ],
  });

  expect(screen.getByText("the conversation")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Empty states" }));

  expect(screen.getByText("the conversation")).toBeInTheDocument();
});

it("focuses the dock composer on Ctrl+K", async () => {
  renderPlane();

  await userEvent.keyboard("{Control>}k{/Control}");

  expect(screen.getByRole("textbox", { name: /message or ask/i })).toHaveFocus();
});

it("focuses a pane by its region number", async () => {
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  await userEvent.keyboard("{Control>}2{/Control}");

  expect(screen.getByRole("region", { name: "PRD" })).toHaveAttribute(
    "data-focused",
    "true",
  );
});

it("remembers the collapsed toolbar across mounts", async () => {
  const { unmount } = renderPlane();

  await userEvent.click(
    screen.getByRole("button", { name: "Collapse toolbar" }),
  );
  unmount();
  renderPlane();

  expect(
    screen.getByRole("button", { name: "Expand toolbar" }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test room-plane`
Expected: FAIL — cannot resolve `./room-plane`.

> **Note the ceiling that is actually reachable.** `MAX_PANES` is 4, but three
> tools ship and only one pane per tool per tab is allowed — so the real ceiling
> today is **three panes**, and the "four is the most a tab holds" message can
> never fire. This is headroom for a fourth tool, not a bug, and the test above
> asserts the message people will actually see ("already open in this tab"). If
> you want four panes reachable now, that is a product decision to take back to
> the spec, not something to fix here.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/features/rooms/components/room-plane.tsx`. Structure:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MeldDock } from "@/ui/meld/dock";
import { MeldPane } from "@/ui/meld/pane";
import { MeldPlane } from "@/ui/meld/plane";
import { MeldTab, MeldTabStrip } from "@/ui/meld/tab-strip";
import { MeldToolbar, MeldToolbarItem } from "@/ui/meld/toolbar";
import { PixelClipboard, PixelCode, PixelPaintBrush } from "@/ui/pixel-icons";
import {
  canPlace,
  insertPaneAt,
  regionsFor,
  removePane,
  type PaneTool,
} from "../pane-layout";
import { createRoomTab, setRoomTabPanes, type RoomTab } from "../room-tabs-repository";
import { PANE_TITLES, PaneContent } from "./pane-content";

const TOOLS: readonly PaneTool[] = ["canvas", "prototype", "prd"];

const TOOL_ICONS = {
  canvas: PixelPaintBrush,
  prototype: PixelCode,
  prd: PixelClipboard,
} as const;

export function RoomPlane({
  roomId,
  tabs,
  activeTabId,
  hasOverview,
  canEdit,
  paneData,
  conversation,
}: {
  roomId: string;
  tabs: RoomTab[];
  activeTabId: string;
  hasOverview: boolean;
  canEdit: boolean;
  paneData: RoomPaneData;
  conversation: React.ReactNode;
}) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const [panes, setPanes] = useState(activeTab?.panes ?? []);
  const [focusedTool, setFocusedTool] = useState<PaneTool | null>(null);

  // Realtime (Task 16) delivers a new layout through props. Reconciling here
  // rather than holding local state as the source of truth is what lets a
  // teammate's placement appear without a reload.
  useEffect(() => {
    setPanes(activeTab?.panes ?? []);
  }, [activeTab?.id, activeTab?.panes]);

  const commit = useCallback(
    (next: PaneTool[]) => {
      setPanes(next);
      if (activeTab) void setRoomTabPanes({ tabId: activeTab.id, panes: next });
    },
    [activeTab],
  );

  const place = useCallback(
    (tool: PaneTool) => {
      // Pressing an open tool focuses it. Two windows onto one document is
      // not worth a slot.
      if (panes.includes(tool)) {
        setFocusedTool(tool);
        return;
      }
      if (!canPlace(panes, tool)) return;
      commit(insertPaneAt(panes, tool, panes.length));
      setFocusedTool(tool);
    },
    [commit, panes],
  );

  const regions = useMemo(() => regionsFor(panes.length), [panes.length]);

  // ...toolbar, tab strip, panes and dock composed below; see the tests for
  // every behaviour this must satisfy.
}
```

Fill in the returned tree composing `MeldTabStrip` + `MeldPlane` + `MeldToolbar` + `MeldPane` + `MeldDock`. **The dock's children are the existing `Conversation`, passed in as the `conversation` prop** — this file must not import `Conversation` directly, so it stays testable without the whole chat stack.

Two details the tests pin down and the implementation must honour:

- **The close control is absent on the last workstream tab.** Compute it as `tabs.length > 1`, where `tabs` excludes Overview — Overview is not in `tabs` at all, it is prepended by the tab strip when `hasOverview` is true.
- **`localStorage` keys are per user and per room where it matters:** `meld.room.toolbar-collapsed` (global — a personal preference about chrome) and `meld.room.<roomId>.last-tab` (per room). The dock's expanded state is `meld.room.dock-expanded`, global.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test room-plane`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms/components/room-plane.tsx apps/web/src/features/rooms/components/room-plane.test.tsx
git commit -m "feat(rooms): wire the room plane with tap-to-place panes and tabs"
```

---

## Task 15: Rewrite the Room page

**Files:**
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx` (278 lines → a thin loader)
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.test.tsx`

**Interfaces:**
- Consumes: `listRoomTabs` (Task 5), `resolveTabParam` (Task 3), `hasOverviewTab` (Task 2), `RoomPlane` (Task 14).
- Produces: the route.

The server component loads the Room, its tabs, and **only the data the active tab's panes need** — the current per-surface `Promise.all` becomes per-pane. A tab with no PRD pane must not load the PRD.

- [ ] **Step 1: Update the page test**

Cover: a legacy `?tab=prd` link opens a tab holding the PRD and rewrites the URL; an unknown `?tab=` falls back to the first tab; a Room with zero tabs gets one created on read rather than rendering an empty strip; Overview is the landing tab for a first-time visitor when it exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test rooms/\\[roomId\\]/page`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test rooms/\\[roomId\\]/page && pnpm --filter web typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx" "apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.test.tsx"
git commit -m "feat(rooms): serve the room as a plane of tabs"
```

---

## Task 16: Tabs in real time

**Files:**
- Create: `apps/web/src/features/rooms/use-room-tabs-realtime.ts`
- Test: `apps/web/src/features/rooms/use-room-tabs-realtime.test.tsx`
- Read first: `apps/web/src/features/rooms/use-room-surface-realtime.ts` — follow its channel and cleanup pattern exactly, including the private-channel config.

**Interfaces:**
- Consumes: `RoomTab`, `parseRoomTabRow` (Task 5).
- Produces: `useRoomTabsRealtime({ roomId, initialTabs }): RoomTab[]`.

- [ ] **Step 1: Write the failing test**

Cover: an INSERT adds a tab in position order; an UPDATE replaces a tab's panes in place; a DELETE removes it; the subscription is torn down on unmount; a malformed payload is ignored rather than throwing.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test use-room-tabs-realtime`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test use-room-tabs-realtime`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms/use-room-tabs-realtime.ts apps/web/src/features/rooms/use-room-tabs-realtime.test.tsx
git commit -m "feat(rooms): sync room tabs across participants in real time"
```

---

# Phase E — Drag and drop

## Task 17: Drag to place, with a keyboard equivalent

**Files:**
- Modify: `apps/web/src/features/rooms/components/room-plane.tsx`
- Modify: `apps/web/src/features/rooms/components/room-plane.test.tsx`

**Interfaces:**
- Consumes: `MeldDropZone` (Task 12), `insertPaneAt`, `movePane`, `regionsFor` (Task 1).
- Produces: no new exports.

The zones a drag offers are the regions the layout **would become**: `regionsFor(panes.length + 1)`, so dragging a third tool onto a two-pane tab offers three zones, not two. Each zone names an **insert index**, never a coordinate.

**Nothing is reachable only by pointer.** Every drag action has a keyboard equivalent, and the active zone is announced through an `aria-live="polite"` region.

- [ ] **Step 1: Write the failing tests**

Add to `room-plane.test.tsx`:

```tsx
// Testing Library does not synthesise a full HTML5 drag, so drive the
// handlers directly with fireEvent -- that is what the component listens to.
import { fireEvent } from "@testing-library/react";

function startDragging(toolLabel: string) {
  fireEvent.dragStart(screen.getByRole("button", { name: toolLabel }), {
    dataTransfer: { setData: () => {}, effectAllowed: "move" },
  });
}

it("shows no zones until a drag starts", () => {
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["canvas"] }],
  });

  expect(screen.queryAllByTestId("drop-zone")).toHaveLength(0);
});

it("offers one more zone than there are panes", () => {
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  startDragging("Prototype");

  expect(screen.getAllByTestId("drop-zone")).toHaveLength(3);
});

it("inserts at the highlighted zone's index, not at the end", () => {
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["canvas"] }],
  });

  startDragging("PRD");
  const [firstZone] = screen.getAllByTestId("drop-zone");
  fireEvent.dragEnter(firstZone);
  fireEvent.drop(firstZone);

  expect(setRoomTabPanes).toHaveBeenCalledWith({
    tabId: "tab-1",
    panes: ["prd", "canvas"],
  });
});

it("highlights only the zone under the cursor", () => {
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["canvas"] }],
  });

  startDragging("PRD");
  const zones = screen.getAllByTestId("drop-zone");
  fireEvent.dragEnter(zones[1]);

  expect(zones[0]).toHaveAttribute("data-active", "false");
  expect(zones[1]).toHaveAttribute("data-active", "true");
});

it("announces the zone under the cursor", () => {
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["canvas"] }],
  });

  startDragging("PRD");
  fireEvent.dragEnter(screen.getAllByTestId("drop-zone")[1]);

  expect(screen.getByRole("status")).toHaveTextContent(
    "Drop to open PRD on the right half",
  );
});

it("opens a new tab when a tool is dropped on the plus", () => {
  renderPlane();

  startDragging("PRD");
  fireEvent.drop(screen.getByRole("button", { name: "New tab" }));

  expect(createRoomTab).toHaveBeenCalledWith({
    roomId: "room-1",
    panes: ["prd"],
  });
});

it("cancels the drag on Escape and places nothing", async () => {
  renderPlane();

  startDragging("PRD");
  await userEvent.keyboard("{Escape}");

  expect(screen.queryAllByTestId("drop-zone")).toHaveLength(0);
  expect(setRoomTabPanes).not.toHaveBeenCalled();
});

it("moves a placed pane to another region", () => {
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  fireEvent.dragStart(screen.getByRole("region", { name: "PRD" }), {
    dataTransfer: { setData: () => {}, effectAllowed: "move" },
  });
  fireEvent.drop(screen.getAllByTestId("drop-zone")[0]);

  expect(setRoomTabPanes).toHaveBeenCalledWith({
    tabId: "tab-1",
    panes: ["prd", "canvas"],
  });
});

// Nothing in this feature may be reachable only by pointer.
it("moves a placed pane from the keyboard, without a pointer", async () => {
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  await userEvent.click(screen.getByRole("button", { name: "Move PRD" }));
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Move to the left half" }),
  );

  expect(setRoomTabPanes).toHaveBeenCalledWith({
    tabId: "tab-1",
    panes: ["prd", "canvas"],
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test room-plane`
Expected: FAIL on the nine new tests; the twelve from Task 14 still pass.

- [ ] **Step 3: Write the implementation**

Add drag state to `room-plane.tsx`:

```tsx
type DragSource =
  | { kind: "tool"; tool: PaneTool }
  | { kind: "pane"; tool: PaneTool; fromIndex: number };

const [dragging, setDragging] = useState<DragSource | null>(null);
const [activeZone, setActiveZone] = useState<number | null>(null);

// The zones a drag offers are the regions the layout WOULD become -- so
// dragging a third tool onto a two-pane tab offers three zones, not two.
// Each names an insert index, never a coordinate.
const zoneCount = dragging?.kind === "pane" ? panes.length : panes.length + 1;
const zones = dragging ? regionsFor(zoneCount) : [];
```

`ZONE_LABELS` maps a region to the sentence the `aria-live` region reads, keyed by the layout it belongs to — `"the left half"`, `"the right half"`, `"the top left quarter"`, and so on. The announcement is `Drop to open ${PANE_TITLES[tool]} on ${ZONE_LABELS[...]}`, rendered in a `<span role="status">` that `MeldPlane` hosts.

Dropping calls `insertPaneAt(panes, tool, zoneIndex)` for a tool drag and `movePane(panes, fromIndex, zoneIndex)` for a pane drag. `Escape` clears both `dragging` and `activeZone` without committing. The keyboard path is a `Move <tool>` button in the pane title bar opening a menu of the same zone labels, calling the same `movePane`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test room-plane`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms/components/room-plane.test.tsx apps/web/src/features/rooms/components/room-plane.tsx
git commit -m "feat(rooms): drag a tool onto a highlighted region or a new tab"
```

---

# Phase F — Overview

## Task 18: The generated Overview tab

**Files:**
- Create: `apps/web/src/features/rooms/components/room-overview-tab.tsx`
- Test: `apps/web/src/features/rooms/components/room-overview-tab.test.tsx`
- Read first: `apps/web/src/features/rooms/components/room-overview.tsx` and `decisions-surface.tsx` — both are being retired, and their content moves here.

**Interfaces:**
- Consumes: `getRoomOverview`, `listRoomDecisions` from `../queries`.
- Produces: `RoomOverviewTab({ overview, decisions, participants, artifacts, basePath })`.

Sections: What this Room is · Decisions · Artifacts · People · Recent. **Read-only — every row navigates, nothing writes.** No toolbar, no panes; an artifact link opens that tool in a new tab.

- [ ] **Step 1: Write the failing test**

Cover: the PRD summary renders, and the opening message stands in when there is no PRD; decisions render (the retired surface's content); each artifact link targets a new tab holding that tool; nothing on the tab is a write control; the toolbar is absent while Overview is active.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test room-overview-tab`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Compose `MeldRegion`, `MeldColumnHeading`, `MeldList`/`MeldListItem`, `MeldTicketRow`, `MeldAvatar`. No raw elements.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test room-overview-tab`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms/components/room-overview-tab.tsx apps/web/src/features/rooms/components/room-overview-tab.test.tsx
git commit -m "feat(rooms): generate the overview tab with decisions inside it"
```

---

# Phase G — Retirement and end-to-end

## Task 19: Delete the old Room

**Files:**
- Delete: `components/room-tab-strip.tsx` + `room-tab-strip.test.tsx`, `room-tabs.ts` + `room-tabs.test.ts`, `surfaces.ts` + `surfaces.test.ts`, `components/decisions-surface.tsx` + `decisions-surface.test.tsx`, `components/stage-coaching-panel.tsx` + `stage-coaching-panel.test.tsx`, `components/stage-progress-ring.tsx`, `components/room-overview.tsx` + `room-overview.test.tsx`
- Keep, unreferenced: `stage-readiness.ts` + `stage-readiness.test.ts`, every stage migration, `set_room_checklist_item`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Find every reference before deleting anything**

```bash
grep -rn "room-tab-strip\|RoomTabStrip\|from \"./surfaces\"\|from \"../surfaces\"\|getRoomSurfaces\|RoomSurface\|DecisionsSurface\|StageCoachingPanel\|StageProgressRing\|ROOM_SURFACE_LABELS" apps/web/src e2e
```

Every hit must be resolved before the file goes. `surfaceState` on `RoomPageData` is still produced by both backends and is now consumed by `overview-eligibility.ts` — **keep the field, delete only `surfaces.ts`.**

- [ ] **Step 2: Delete the files and fix the fallout**

```bash
git rm apps/web/src/features/rooms/components/room-tab-strip.tsx apps/web/src/features/rooms/components/room-tab-strip.test.tsx apps/web/src/features/rooms/room-tabs.ts apps/web/src/features/rooms/room-tabs.test.ts apps/web/src/features/rooms/surfaces.ts apps/web/src/features/rooms/surfaces.test.ts apps/web/src/features/rooms/components/decisions-surface.tsx apps/web/src/features/rooms/components/decisions-surface.test.tsx apps/web/src/features/rooms/components/stage-coaching-panel.tsx apps/web/src/features/rooms/components/stage-coaching-panel.test.tsx apps/web/src/features/rooms/components/stage-progress-ring.tsx apps/web/src/features/rooms/components/room-overview.tsx apps/web/src/features/rooms/components/room-overview.test.tsx
```

- [ ] **Step 3: Add a comment recording why `stage-readiness.ts` stays**

At the top of `stage-readiness.ts`, note that the stage ladder was retired from the Room UI on 2026-08-20 by the freeform-canvas rebuild, that this engine and its data are deliberately retained, and that it may return as an Overview section. Without this, the next reader deletes it as dead code.

- [ ] **Step 4: Run the full suite**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm exec eslint && node scripts/check-astryx-conventions.mjs`
Expected: all clean, no unresolved imports.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(rooms): retire the tabbed room surfaces and the stage pill"
```

---

## Task 20: End-to-end

**Files:**
- Create: `e2e/room-plane.spec.ts`
- Read first: an existing spec in `e2e/` for the sign-in and workspace fixtures.

**Interfaces:**
- Consumes: the whole feature.
- Produces: nothing.

- [ ] **Step 1: Write the failing spec**

Cover, as separate tests:

1. A new Room opens empty — one untitled tab, no panes, dock at rest, composer focused.
2. Tapping Canvas then PRD gives two panes side by side.
3. Dragging Prototype onto `+` opens a new tab holding only Prototype.
4. The dock shows the same conversation on both tabs — post a message on one, switch, and see it.
5. A second browser context sees a tab the first context added, without a reload.
6. A legacy `?tab=prd` link opens a tab holding the PRD.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec playwright test e2e/room-plane.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Fix whatever the spec catches**

Integration bugs the unit tests could not see. Fix in the owning module, not in the spec.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec playwright test e2e/room-plane.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Full verification and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm exec eslint && node scripts/check-astryx-conventions.mjs && pnpm exec playwright test`

```bash
git add e2e/room-plane.spec.ts
git commit -m "test(rooms): cover the freeform room end to end"
```

---

## Self-review notes

Checked against the spec on 2026-08-20:

- **Every spec section has a task.** Tab strip → 10, 14. Plane → 7. Toolbar → 9, 14. Panes → 8, 13. Dock → 11, 14. Regions → 1. Drag → 17. Keyboard → 9, 14, 17. Empty Room → 14, 20. Overview → 2, 18. Data + RLS + backfill + first-tab invariant → 4, 5. Realtime → 16. Retirement → 19. Accessibility → 8, 9, 10, 11, 12, 17. Testing → every task, plus 20.
- **Deliberately deferred:** spec phases 8 (agent pane-context) and 9 (presence liveness). Stated at the top; they get a follow-up plan.
- **Naming is consistent across tasks:** `PaneTool`, `PaneRegion`/`MeldPaneRegion`, `PaneLayout`, `RoomTab`, `regionsFor`, `canPlace`, `insertPaneAt`, `movePane`, `removePane`, `hasOverviewTab`, `resolveTabParam`, `listRoomTabs`, `setRoomTabPanes`.
- **One deliberate layering note:** `MeldPane` type-imports `PaneRegion` from `features/rooms/pane-layout`. Type-only, no runtime edge. Recorded in Task 1 so it is a decision rather than an accident.
- **Task 6 is allowed to change Task 1.** If the canvas or prototype viewer cannot survive a quadrant, `canPlace` gains a minimum-region rule and Task 1's tests are amended in Task 6's commit. Every later task must read Task 6's finding first.
