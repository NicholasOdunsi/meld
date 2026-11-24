# Inspector Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the canvas right-hand panel into a Figma-style inspector: automatic selection, real values, real controls (font, weight, colour, numbers), a shape property panel, a proper Code view, and Undo/Redo in the header.

**Architecture:** The live frame's bridge reports computed styles for the selected element and draws its own selection outline. The host keeps the selection across edits by re-selecting the edited element after each recompile. The Tweak panel renders display values (computed, merged with what the source can edit) through small controls. A shared `ColourField` serves screens and shapes. The panel only renders when something is selected (an element, a shape, or Code opened explicitly).

**Tech Stack:** TypeScript, React 19, Astryx (`@astryxdesign/core`), CodeMirror 6, Excalidraw, Vitest, Playwright, pnpm workspace (`@meld/web`, `@meld/screen-runtime`).

Spec: `docs/superpowers/specs/2026-11-21-inspector-panels-design.md`. Worktree: `/Users/maxuser/conductor/workspaces/meld/canvas-powers-live-paste`, branch `NicholasOdunsi/canvas-powers-live-paste`.

## Global Constraints

- Astryx rules (AGENTS.md): no raw `<div>`/`<span>` for layout; use components; no raw hex/px in styles (tokens `var(--color-*|--spacing-*|--radius-*)`); no `.css`/Tailwind in UI. **Exception:** colour swatch fills and the frame bridge overlay legitimately use literal colour values (they display user data / live inside the sandboxed frame).
- Run `pnpm check:astryx` before finishing any UI task; run `pnpm exec astryx component <Name>` for any component prop you are unsure of.
- Font families offered: exactly **Sans, Serif, Mono** (frames cannot download fonts).
- Weight options: Light 300, Regular 400, Medium 500, Semibold 600, Bold 700, Extra bold 800.
- User-facing copy (verbatim): number error "Use a whole number, like 8."; colour error "Use a colour like #1A2B3C."; computed note "Set by the screen's code. Change it in Code."; never show raw class names (`bg-red-500`, `Rounded-md`).
- Accessible names that tests rely on stay stable: toolbar buttons `Undo`, `Redo`, `Close`, `Interact`; tabs `Tweak`, `Code`; field labels `Text`, `Font`, `Size`, `Weight`, `Text colour`, `Background colour`, `Width`, `Height`, `Padding`, `Gap`, `Corner radius`.
- Frame messages stay bounded: strings capped, fixed field set, zod `.strict()` schemas.
- Test commands: engine `pnpm --filter @meld/screen-runtime exec vitest run <path>`; web `pnpm --filter @meld/web exec vitest run <path>`; browser `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts <spec> --timeout=60000`. Before a browser run make sure port 3018 is free (`lsof -ti tcp:3018`); do not touch the Mac preview site on 3107.
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File map

| File | Task | Responsibility |
|---|---|---|
| `packages/screen-runtime/src/edit/{types,style,html,jsx}.ts` + tests | 1 | `fontFamily` field |
| `packages/screen-runtime/src/runtime/bridge.ts` + `bridge.pick.test.ts` | 2 | computed values, selection overlay, select/clear messages |
| `apps/web/.../live/{live-messages,live-controller,element-session,hand-editing}.ts` + tests | 3 | carry `computed`, `selectElement`, `clearPicked`, deselect |
| `apps/web/.../live/inspector-values.ts` (+test) | 4 | computed → display values, weights/families |
| `apps/web/.../live/colour-palette.ts`, `colour-field.tsx` (+tests) | 5 | palette, hex normalising, used colours, popup |
| `apps/web/.../live/tweak-panel.tsx` (+test) | 6 | the inspector body |
| `apps/web/.../live/{live-panel,hand-edit-panel}.tsx`, `excalidraw-board.tsx`, `chrome/selection-pill.tsx` | 7 | header, visibility, auto select, Interact, keep selection |
| `apps/web/.../live/{code-editor.tsx,code-theme.ts}` (+test) | 8 | proper code view |
| `apps/web/.../chrome/{shape-style.ts,shape-panel.tsx}` (+tests) | 9 | shape property panel |
| `e2e/canvas-excalidraw-live.spec.ts`, `e2e/canvas-excalidraw-chrome.spec.ts` | 10 | browser acceptance, screenshots |

`.../` below means `apps/web/src/features/canvas-excalidraw`.

---

### Task 1: `fontFamily` in the edit engine

**Files:** Modify `packages/screen-runtime/src/edit/types.ts`, `style.ts`, `html.ts`, `jsx.ts`; tests `style.test.ts`, `index.test.ts`.

**Interfaces — Produces:** `Field` gains `"fontFamily"`; `Tweak {field:"fontFamily", value:"sans"|"serif"|"mono"}`; `Inspection.fontFamily.value` is `"sans"|"serif"|"mono"|null` (null when the code uses some other stack). Class-based source uses `font-sans|font-serif|font-mono`; otherwise an inline `font-family` is written.

- [ ] **Step 1: Write failing tests** — append to `packages/screen-runtime/src/edit/index.test.ts` inside the top-level `describe`:

```ts
describe("font family", () => {
  const sans = "ui-sans-serif, system-ui, sans-serif";
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  it("swaps an existing family utility in HTML", () => {
    const s = '<b class="font-serif">Hi</b>';
    expect(applyTweak({ "index.html": s }, tag("index.html", s), { field: "fontFamily", value: "mono" })).toEqual({
      ok: true, files: { "index.html": '<b class="font-mono">Hi</b>' },
    });
  });
  it("adds an inline family to HTML that has none, and reads it back", () => {
    const s = "<b>Hi</b>";
    const out = applyTweak({ "index.html": s }, tag("index.html", s), { field: "fontFamily", value: "mono" });
    expect(out).toEqual({ ok: true, files: { "index.html": `<b style="font-family: ${mono}">Hi</b>` } });
    const t = `<p style="font-family: ${sans}">x</p>`;
    expect(inspectElement({ "index.html": t }, tag("index.html", t))!.fontFamily).toEqual({ editable: true, value: "sans" });
  });
  it("is editable but unnamed when the code uses a custom stack", () => {
    const s = '<p style="font-family: Inter">x</p>';
    expect(inspectElement({ "index.html": s }, tag("index.html", s))!.fontFamily).toEqual({ editable: true, value: null });
  });
  it("adds a style prop in JSX without disturbing className", () => {
    const s = '<p className="font-bold">x</p>';
    const files = { "App.tsx": jsxPrefix + s };
    const out = applyTweak(files, tag("App.tsx", s, jsxPrefix.length), { field: "fontFamily", value: "serif" });
    expect(out).toEqual({ ok: true, files: { "App.tsx": jsxPrefix + '<p style={{fontFamily:"ui-serif, Georgia, serif"}} className="font-bold">x</p>' } });
  });
  it("does not let an important family utility be shadowed", () => {
    const s = '<p className="!font-serif">x</p>';
    expect(inspectElement({ "index.html": s }, tag("index.html", s))!.fontFamily.editable).toBe(false);
  });
  it("keeps a font weight utility out of the family field", () => {
    const s = '<p className="font-bold">x</p>';
    const r = inspectElement({ "index.html": s }, tag("index.html", s))!;
    expect(r.fontWeight.value).toBe("700");
    expect(r.fontFamily.value).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL:** `pnpm --filter @meld/screen-runtime exec vitest run src/edit/index.test.ts` (fails: unknown field / not editable).

- [ ] **Step 3: Implement.**
  - `types.ts`: insert `"fontFamily"` into `FIELDS` right after `"fontWeight"`.
  - `style.ts`: add after `weights`:

```ts
export const FAMILY_STACKS = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;
export type FamilyKey = keyof typeof FAMILY_STACKS;
export function familyKeyOf(stack: string): FamilyKey | null {
  const clean = stack.trim();
  return (Object.keys(FAMILY_STACKS) as FamilyKey[]).find((k) => FAMILY_STACKS[k] === clean) ?? null;
}
```
  In `cssValue` add before the weight line: `if (field === "fontFamily") return Object.hasOwn(FAMILY_STACKS, value) ? FAMILY_STACKS[value as FamilyKey] : null;`.
  In `recognize`, in the `font-` branch (where `const weight = /^font-(.+)$/.exec(token)` is), before looking up weights add: `if (weight && (weight[1] === "sans" || weight[1] === "serif" || weight[1] === "mono")) return { field: "fontFamily", value: weight[1] };`.
  In `changeUtility`, compute replacement for `fontFamily` as `` `font-${tweak.value}` `` (the existing ternary builds the replacement from `value`; add the `fontFamily` branch ahead of it).
  In `utilityBlocked`, replace the `fontWeight` line with:

```ts
    if (field === "fontWeight" || field === "fontFamily") {
      const known = utilityField(base);
      return known === null ? base.startsWith("font-") : false; // a known utility of the other field does not own this one
    }
```
  (The earlier `if (utilityField(base) === field) return true;` line already handles an exact match.)
  - `html.ts`: add `fontFamily: "font-family"` to `properties`; in `conflicts`, make the `font` shorthand also conflict for `fontFamily` (`(field === "fontSize" || field === "fontWeight" || field === "fontFamily") && prop === "font"`); where the binding's `value` is computed from `current.value`, for `field === "fontFamily"` use `familyKeyOf(current.value)` instead of stripping `px`.
  - `jsx.ts`: in `conflicts` add `|| (field === "fontFamily" && key === "font")`; where `current` is turned into the binding value, for `fontFamily` use `familyKeyOf(current)` instead of `current.replace(/px$/i, "")`.
  - Import `familyKeyOf` in both adapters from `./style`.

- [ ] **Step 4: Run, expect PASS:** the file above, then the whole package: `pnpm --filter @meld/screen-runtime test`. Fix any test that enumerates `FIELDS` (they now include `fontFamily`).
- [ ] **Step 5: Check consumers:** `grep -rn "Record<Field\|FIELDS\|labels\[" apps/web/src` and make web typecheck pass later in Task 6 (note them; `labels` in `tweak-panel.tsx` is rewritten there). Run `pnpm typecheck` and confirm the only failures are in `tweak-panel.tsx` / its tests.
- [ ] **Step 6: Commit** `feat(edit): add a font family field (Sans, Serif, Mono)`.

---

### Task 2: Frame bridge — computed values, selection outline, select/clear

**Files:** Modify `packages/screen-runtime/src/runtime/bridge.ts`; extend `bridge.pick.test.ts` (copy its harness).

**Interfaces — Produces:** host→frame messages `{source:"orion-host", type:"pick-mode", enabled, epoch}` (existing), `{type:"select-element", src, epoch}`, `{type:"clear-selection"}`. Frame→host: `picked` gains `computed: Computed` where
`Computed = { fontFamily, fontSize, fontWeight, color, backgroundColor, width, height, padding, gap, borderRadius, display }` (all strings, each capped); new `{type:"deselected"}` when, in select mode, a click lands on nothing taggable.

- [ ] **Step 1: Failing tests** in `bridge.pick.test.ts`, using the file's existing way of installing the bridge in jsdom and dispatching clicks: (a) clicking a tagged `<button style="font-size:20px;padding:12px">` in pick mode posts `picked` whose `computed.fontSize === "20"` and `computed.padding === "12"`; (b) a host `select-element` message with that element's `data-orion-src` posts the same `picked`; (c) after selecting, `document.querySelector("[data-orion-overlay]")` exists and `window.__orionSnapshot()` does **not** contain `data-orion-overlay`; (d) `clear-selection` removes the overlay; (e) in pick mode, clicking an untagged region posts `{type:"deselected"}` and removes the overlay; (f) `computed` strings are never longer than their caps.
- [ ] **Step 2: Run, expect FAIL:** `pnpm --filter @meld/screen-runtime exec vitest run src/runtime/bridge.pick.test.ts`.
- [ ] **Step 3: Implement** in the `FRAME_BRIDGE_SOURCE` template string (no backticks, no `${` inside the added code). Add near `let picking = false, pickEpoch = 0;`:

```js
  const px = (v) => { const n = parseFloat(v); return String(Number.isFinite(n) ? Math.round(n * 10) / 10 : 0); };
  const readComputed = (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return {
      fontFamily: s.fontFamily.slice(0, 120), fontSize: px(s.fontSize), fontWeight: String(s.fontWeight).slice(0, 12),
      color: s.color.slice(0, 40), backgroundColor: s.backgroundColor.slice(0, 40),
      width: px(r.width), height: px(r.height), padding: px(s.paddingTop), gap: px(s.rowGap),
      borderRadius: px(s.borderTopLeftRadius), display: s.display.slice(0, 20),
    };
  };
  let overlay = null, marked = null;
  const place = () => {
    if (!marked || !overlay) return;
    const r = marked.getBoundingClientRect();
    overlay.style.left = r.left + 'px'; overlay.style.top = r.top + 'px';
    overlay.style.width = r.width + 'px'; overlay.style.height = r.height + 'px';
  };
  const mark = (el) => {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('data-orion-overlay', '');
      overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;outline:2px solid #6965db;outline-offset:-1px;border-radius:2px';
      document.documentElement.appendChild(overlay);
    }
    marked = el; place();
  };
  const clearMark = () => { if (overlay) overlay.remove(); overlay = null; marked = null; };
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  const choose = (tagged) => {
    const src = tagged && tagged.getAttribute('data-orion-src');
    if (!src || src.length > 155) return false;
    mark(tagged);
    post({ type: 'picked', epoch: pickEpoch, src, computed: readComputed(tagged),
      label: (tagged.getAttribute('aria-label') || tagged.textContent || tagged.tagName).trim().slice(0, 100) });
    return true;
  };
```
  In the `message` listener add handlers: `select-element` (validate `typeof data.src === 'string'`, find `Array.from(document.querySelectorAll('[data-orion-src]')).find(n => n.getAttribute('data-orion-src') === data.src)`, then `choose(found)`), and `clear-selection` → `clearMark()`. In `__orionSnapshot` add `root.querySelectorAll('[data-orion-overlay]').forEach((node) => node.remove());` before serialising. Replace the body of the `if (picking) { ... }` click branch with: `event.preventDefault(); event.stopImmediatePropagation(); const tagged = <existing closest logic>; if (!choose(tagged)) { clearMark(); post({ type: 'deselected' }); } return;`.
- [ ] **Step 4: Run PASS** the file, then `pnpm --filter @meld/screen-runtime test`.
- [ ] **Step 5: Commit** `feat(bridge): report computed styles, draw the selection outline, accept select/clear`.

---

### Task 3: Controller and message plumbing

**Files:** Modify `.../live/live-messages.ts`, `live-controller.ts`, `element-session.ts`, `hand-editing.ts` (and their tests).

**Interfaces — Consumes:** Task 2 messages. **Produces:**
- `Selected` gains `computed: Computed | null` (type `Computed` exported from `live-messages.ts`).
- `LiveController.selectElement(src: string): void` (posts `select-element` to the live frame, same epoch rules as `setPickEnabled`), `LiveController.clearSelection(): void` (posts `clear-selection`), and an `onDeselected` signal: the controller calls a callback passed at creation (`deps.onDeselected?.()`) when it receives `deselected`.
- `HandEditing.clearPicked(): void` and `HandEditing.getPicked()` unchanged.

- [ ] **Step 1: Failing tests.** In `live-messages.test.ts`: a `picked` message with a valid `computed` object parses; one with an extra key, or any string over 120 chars, is rejected; `{type:"deselected"}` parses. In `live-controller.test.ts` (reuse its `setup` helper): `selectElement("a.tsx:0:10")` posts `{source:"orion-host",type:"select-element",src:"a.tsx:0:10"}` to the live frame; `clearSelection()` posts `clear-selection`; receiving `deselected` calls `onDeselected`. In `hand-editing.test.ts`: `clearPicked()` makes `getPicked()` return `null` and notifies subscribers; a `picked` message stores `computed` on the `Selected`.
- [ ] **Step 2: Run FAIL** `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live/live-messages.test.ts src/features/canvas-excalidraw/live/live-controller.test.ts src/features/canvas-excalidraw/live/hand-editing.test.ts`.
- [ ] **Step 3: Implement.** In `live-messages.ts` add:

```ts
const cap = (n: number) => z.string().max(n);
export const computedSchema = z.object({
  fontFamily: cap(120), fontSize: cap(12), fontWeight: cap(12), color: cap(40), backgroundColor: cap(40),
  width: cap(12), height: cap(12), padding: cap(12), gap: cap(12), borderRadius: cap(12), display: cap(20),
}).strict();
export type Computed = z.infer<typeof computedSchema>;
```
  extend the `picked` schema with `computed: computedSchema.optional()` and add `z.object({ source, type: z.literal("deselected") }).strict()` to the union. In the controller, model `selectElement`/`clearSelection` on the existing `setPickEnabled` posting code (same frame lookup and guards), handle `deselected` by calling `deps.onDeselected?.()`. In `element-session.ts` extend `Selected` and wherever a `Selected` is built from a `picked` message copy `computed ?? null`. In `hand-editing.ts` add `clearPicked()` (set picked to null, notify).
- [ ] **Step 4: Run PASS,** then `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(canvas): carry computed values and selection messages through the live controller`.

---

### Task 4: Display values

**Files:** Create `.../live/inspector-values.ts`, `inspector-values.test.ts`.

**Interfaces — Consumes:** `Inspection`, `Field` from `@meld/screen-runtime/edit/types`; `Computed` from `./live-messages`. **Produces:**

```ts
export const WEIGHTS: readonly { value: "300"|"400"|"500"|"600"|"700"|"800"; label: string }[]
export const FAMILIES: readonly { value: "sans"|"serif"|"mono"; label: string }[]
export function rgbToHex(css: string): string | null          // "rgb(18, 52, 86)" -> "#123456"; transparent/alpha 0 -> null
export function familyKey(stack: string): "sans" | "serif" | "mono"
export function firstFontName(stack: string): string           // '"Inter", system-ui' -> "Inter"
export function nearestWeight(value: string): string           // "650" -> "600"
export type FieldView = { editable: boolean; value: string | null; auto: boolean; hidden: boolean }
export function displayValues(inspection: NonNullable<Inspection>, computed: Computed | null): Record<Field, FieldView>
```

Rules for `displayValues`: `text`: value from the inspection, `hidden` when not editable and null. Numeric fields (`fontSize, padding, gap, borderRadius, width, height`): value is the computed number string when `computed` exists, else the inspection value only if it is a plain number, else null; `auto` is true for `width`/`height` when the inspection value is null or not a plain number. Colours: computed → `rgbToHex`, else inspection value only if it is a hex. `fontWeight`: `nearestWeight(computed.fontWeight)`. `fontFamily`: `familyKey(computed.fontFamily)`. `gap` is `hidden` unless `computed.display` contains `flex` or `grid`. `editable` always comes from the inspection.

- [ ] **Step 1: Failing tests** (`inspector-values.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { displayValues, familyKey, firstFontName, nearestWeight, rgbToHex } from "./inspector-values";
import { FIELDS, type Inspection } from "@meld/screen-runtime/edit/types";

const insp = (over: Record<string, { editable: boolean; value: string | null }> = {}) =>
  Object.fromEntries(FIELDS.map((f) => [f, over[f] ?? { editable: true, value: null }])) as NonNullable<Inspection>;
const computed = { fontFamily: '"Inter", system-ui, sans-serif', fontSize: "16", fontWeight: "500", color: "rgb(255, 255, 255)",
  backgroundColor: "rgb(18, 52, 86)", width: "120", height: "40", padding: "12", gap: "0", borderRadius: "6", display: "block" };

describe("inspector values", () => {
  it("converts colours and names fonts", () => {
    expect(rgbToHex("rgb(18, 52, 86)")).toBe("#123456");
    expect(rgbToHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(firstFontName('"Inter", system-ui')).toBe("Inter");
    expect(familyKey("ui-monospace, Menlo, monospace")).toBe("mono");
    expect(familyKey("Georgia, serif")).toBe("serif");
    expect(familyKey("Inter, sans-serif")).toBe("sans");
    expect(nearestWeight("650")).toBe("600");
    expect(nearestWeight("700")).toBe("700");
  });
  it("shows real numbers even when the source states nothing", () => {
    const v = displayValues(insp({ width: { editable: true, value: null } }), computed);
    expect(v.width).toMatchObject({ value: "120", auto: true, editable: true });
    expect(v.padding.value).toBe("12");
    expect(v.backgroundColor.value).toBe("#123456");
    expect(v.fontWeight.value).toBe("500");
    expect(v.fontFamily.value).toBe("sans");
  });
  it("hides gap unless the element lays out children, keeps code-owned fields dimmed", () => {
    expect(displayValues(insp(), computed).gap.hidden).toBe(true);
    expect(displayValues(insp(), { ...computed, display: "flex" }).gap.hidden).toBe(false);
    expect(displayValues(insp({ color: { editable: false, value: null } }), computed).color.editable).toBe(false);
  });
  it("falls back to the source when nothing was reported", () => {
    const v = displayValues(insp({ padding: { editable: true, value: "8" }, backgroundColor: { editable: true, value: "bg-red-500" } }), null);
    expect(v.padding.value).toBe("8");
    expect(v.backgroundColor.value).toBeNull();
  });
});
```
- [ ] **Step 2: Run FAIL.** **Step 3: Implement** the module per the rules above (pure functions; `rgbToHex` parses `rgb(a)` with a regex, returns null for alpha 0 or non-matching input; `familyKey` lowercases and checks `mono|menlo|consolas|courier` → mono, `serif` without `sans` or `georgia|times` → serif, else sans; `nearestWeight` snaps to the nearest of the six values). **Step 4: Run PASS.** **Step 5: Commit** `feat(canvas): turn rendered styles into inspector display values`.

---

### Task 5: Colour palette and colour field

**Files:** Create `.../live/colour-palette.ts`, `colour-palette.test.ts`, `colour-field.tsx`, `colour-field.test.tsx`.

**Interfaces — Produces:**

```ts
export const PALETTE: readonly (readonly string[])[]          // rows of lowercase hex: greys then 8 hues x 5 shades
export function normaliseHex(input: string): string | null    // "#ABC"->"#aabbcc", "123456"->"#123456", else null
export function usedColours(files: Record<string, string>, extra?: readonly string[]): string[]  // distinct hex colours, source order, max 8
export function ColourField(props: {
  label: string;                  // accessible name of the trigger, e.g. "Background colour"
  value: string | null;           // "#rrggbb" or null (none)
  used: readonly string[];
  isDisabled?: boolean;
  onChange: (hex: string) => void;
  onClear?: () => void;           // when given, a "None" choice is shown
}): JSX.Element
```

- [ ] **Step 1: Failing tests** for `colour-palette.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PALETTE, normaliseHex, usedColours } from "./colour-palette";
describe("colour palette", () => {
  it("normalises hex input", () => {
    expect(normaliseHex("#ABC")).toBe("#aabbcc");
    expect(normaliseHex("123456")).toBe("#123456");
    expect(normaliseHex("#12345")).toBeNull();
    expect(normaliseHex("red")).toBeNull();
  });
  it("collects each colour used in the source once, in order, capped at 8", () => {
    const files = { "a.tsx": 'x="#FF0000" y="bg-[#00ff00]" z="#ff0000" #abc', "b.css": "a{color:#112233}" };
    expect(usedColours(files)).toEqual(["#ff0000", "#00ff00", "#aabbcc", "#112233"]);
    const many = { "a.css": Array.from({ length: 12 }, (_, i) => `#0000${(10 + i).toString(16)}0`).join(" ") };
    expect(usedColours(many)).toHaveLength(8);
  });
  it("is a clean grid of valid colours", () => {
    for (const row of PALETTE) for (const c of row) expect(normaliseHex(c)).toBe(c);
  });
});
```
and `colour-field.test.tsx` (jsdom): clicking the `Background colour` button opens a popup; clicking a swatch calls `onChange` with its hex; typing `#12345` in the `Hex` textbox and pressing Enter shows "Use a colour like #1A2B3C." and does not call `onChange`; typing `#123456` + Enter calls `onChange("#123456")`; a used colour appears under "Used on this screen" and is clickable; `onClear` renders a `None` choice.
- [ ] **Step 2: Run FAIL.**
- [ ] **Step 3: Implement.** `PALETTE`: first row `#ffffff #f5f5f5 #d4d4d4 #a3a3a3 #737373 #404040 #171717 #000000`; then for each hue (red, orange, yellow, green, teal, blue, purple, pink) a row of five Tailwind-500-family shades from lighter to darker (use the Tailwind 200/300/400/500/700 hex values). `usedColours`: scan every file with `/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g`, normalise, de-duplicate, then append `extra`, cap at 8. `ColourField`: Astryx `Popover` (`placement="below"`) whose trigger is a `Button` (variant secondary, size sm, accessible `label`, showing a round swatch of `value` and the hex text; check `pnpm exec astryx component Button` for the way to show an icon plus visible text); popup content in a `VStack`: a `Grid` of swatch `IconButton`s per palette row (label = the hex, tooltip = hex), an optional "Used on this screen" section, an optional `None` `Button`, and a `TextInput` labelled `Hex` (size sm) that commits on Enter/blur via `normaliseHex`, showing `status={{type:"error",message:"Use a colour like #1A2B3C."}}` on failure. A swatch is an SVG circle with `fill={hex}` (literal colour is allowed here). Arrow-key movement between swatches is provided by the Astryx button group focus behaviour; if not, add roving `tabIndex`. Escape closes the popup.
- [ ] **Step 4: Run PASS** both files + `pnpm check:astryx`. **Step 5: Commit** `feat(canvas): colour palette and colour field popup`.

---

### Task 6: Rewrite the Tweak panel body

**Files:** Rewrite `.../live/tweak-panel.tsx`; rewrite `tweak-panel.test.tsx`.

**Interfaces — Consumes:** Tasks 1, 4, 5. **Produces:**

```ts
export type TweakPanelProps = {
  label: string;                        // the picked element's name
  fields: NonNullable<Inspection>;
  computed: Computed | null;
  used: readonly string[];
  onTweak: (tweak: Tweak) => void;
  onAdd: () => void;
  canAdd: boolean;
  addReason?: string;
};
```
Pick/Undo/Redo props are **removed** (Task 7 moves them). The panel is only rendered when an element is selected.

Layout, top to bottom, all via Astryx components: element name (`Text type="label"`); sections `Content` (`Text` field, shown unless `hidden`), `Typography` (Font `Selector` + caption `Showing: <firstFontName>`; Size + Weight side by side in a `Grid columns={{minWidth:96,repeat:"fit"}}`; Text colour `ColourField`), `Layout` (Width, Height, Padding, Gap — number fields), `Appearance` (Background `ColourField`, Corner radius number). Number fields show `units="px"`; an auto width/height shows a small `Text type="supporting"` "auto". Editable false → `isDisabled` with the note "Set by the screen's code. Change it in Code." once at the bottom of the section that contains it. `Add to chat` only when `canAdd`, else the `addReason` line only when present. Commit behaviour: numbers commit on Enter and blur (and arrow-key steps), never per keystroke; invalid → "Use a whole number, like 8." (allow only digits, optional decimal); selectors commit immediately.

- [ ] **Step 1: Failing tests** (rewrite the file; keep the existing `FIELDS`-driven helper style):
  - renders `Text`, `Font`, `Size`, `Weight`, `Text colour`, `Background colour`, `Width`, `Height`, `Padding`, `Corner radius` controls for a full inspection (gap hidden for `display:"block"`); no `Pick`, `Undo` or `Redo` buttons and no textbox/button named after raw class names (`bg-red-500`).
  - shows real numbers: with `computed.width="120"` the `Width` field has value `120`, with an "auto" tag when the source states none.
  - choosing `Mono` in `Font` calls `onTweak({field:"fontFamily",value:"mono"})`; choosing `Bold` in `Weight` calls `onTweak({field:"fontWeight",value:"700"})`; picking a swatch in `Background colour` calls `onTweak({field:"backgroundColor",value:"#xxxxxx"})`.
  - typing `16` in `Padding` then Enter then blur commits once with `{field:"padding",value:"16"}`; typing `abc` shows "Use a whole number, like 8." and commits nothing.
  - a code-owned field is disabled and the note "Set by the screen's code. Change it in Code." appears.
  - `Add to chat` is absent when `canAdd` is false and the reason is shown.
- [ ] **Step 2: Run FAIL.** **Step 3: Implement** (run `pnpm exec astryx component NumberInput` and `Selector`; if `NumberInput` has no blur/Enter hook, use `TextInput` with the label `Padding (px)` like the old panel and the same commit logic, keeping the accessible names `Padding` etc. via a regex in tests). Use the existing `LiteralField` commit logic (`submitted` ref, local state) as the pattern and keep the `key=` remount trick so a new element or new value resets local state. Compute `used` upstream (Task 7). **Step 4: Run PASS;** `pnpm typecheck` still fails in `hand-edit-panel.tsx` (fixed in Task 7). **Step 5: Commit** `feat(canvas): rebuild the Tweak panel as a real inspector`.

---

### Task 7: Panel shell, automatic selection, Interact, visibility, keep selection

**Files:** Modify `.../live/live-panel.tsx`, `.../live/hand-edit-panel.tsx`, `.../excalidraw-board.tsx`, `.../chrome/selection-pill.tsx`, tests `live-panel.test.tsx`, `hand-edit-panel.test.tsx`, `chrome/selection-pill.test.tsx`.

**Interfaces — Produces:**
- `LivePanel` props gain `history?: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }`; its header becomes `Screen` title · `Undo` · `Redo` · `Close` (icon buttons with tooltips, lucide `Undo2`/`Redo2`, disabled via `isDisabled`). Header only shows Undo/Redo when `history` is given.
- `HandEditPanel` now renders the `LivePanel` itself (wrapping the tabs and body), taking `onClose` and `onTabChange`; the board no longer wraps it. It owns the undo/redo handlers and passes them as `history`.
- `SelectionPill` screen actions for an awake, editable screen add an `Interact` toggle button (`aria-pressed`) before `Code`.
- Board state `interact: boolean` (default `false`, reset to `false` whenever a new element is picked or the live screen changes).

Behaviour to implement (each with a test):
1. **Automatic select mode.** Board effect: when a drafted, editable screen is awake and not `interact`, call `live.setPickEnabled(true)`; otherwise `false`. Re-run on `liveState.attempt`, `liveState.phase`, `interact`. Remove every `live.setPickEnabled(false)` from `HandEditPanel` (`invalidate`, unmount cleanup) and the `Pick` button handler; `invalidate` now only clears the local selection state. Read-only drafts never enable select mode.
2. **Panel visibility.** The panel's `end` slot renders when `(panelOpen /* Code explicitly opened */ || validPicked) && liveState.phase !== "asleep"`, where `validPicked = editing.getPicked()` matches the current screen and draft revision (existing check in `HandEditPanel`). Waking a screen does not set `panelOpen`; the pill's `Code` button sets `panelOpen` and tab `code`; a compile failure still opens Code. A new pick switches to the Tweak tab. Deselecting (Escape or `deselected`) with Code not open closes the panel.
3. **Escape.** In the board's Escape handler and the bridge `escape` handler: if there is a valid pick → `editing.clearPicked()` and `live.clearSelection()` (do not sleep); else sleep as today.
4. **Deselect.** Pass `onDeselected: () => editing.clearPicked()` where the controller is created.
5. **Keep selection after an edit.** In `HandEditPanel.tweak`, after `commitTweak` succeeds, compute the edited element's new tag: same `file` and `start`, `end` shifted by `nextFile.length - previousFile.length` (the splice is confined to the element). Store it as `reselect` in the board (ref). When the live controller reports the recompiled frame ready (the existing ready/attempt transition after `previewDraft`), call `live.selectElement(reselect)` and clear the ref. A Code-tab or history edit clears `reselect` (selection is dropped as today).
6. **Interact.** The pill toggle flips `interact`; when on, select mode is off, the outline is cleared (`live.clearSelection()`), and clicks reach the screen. Picking again is impossible until it is turned off; the toggle label stays `Interact` and reflects `aria-pressed`.
7. **`used` colours** for the panel: `usedColours(draftState.source.files, computedColourHexes)` where `computedColourHexes` are `rgbToHex` of the picked element's computed text and background colours.
8. Undo/Redo also answer ⌘Z / ⇧⌘Z while focus is in the panel (not inside the code editor, which keeps its own bindings).

- [ ] **Step 1: Failing tests.** `live-panel.test.tsx`: header renders `Undo`, `Redo`, `Close` in that order when `history` is given and disables Undo when `canUndo` is false; no Undo/Redo without `history`. `selection-pill.test.tsx`: an awake editable screen shows `Interact` and `Code`; pressing `Interact` calls the handler and reflects `aria-pressed`. `hand-edit-panel.test.tsx`: no `Pick` button is rendered; the Tweak body only renders for a valid pick; after a successful tweak the panel calls `selectElement` with the shifted tag once the frame is ready (use the file's existing fakes for `live`). Add a small pure helper `shiftTag(src: string, delta: number): string` in `element-session.ts` with its own unit test (`"a.tsx:10:50"`, `+7` → `"a.tsx:10:57"`; rejects unparsable input by returning it unchanged).
- [ ] **Step 2: Run FAIL** (`pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw`).
- [ ] **Step 3: Implement** the eight behaviours above. Keep the existing readOnly, conflict, retry and code-tab hosting (`EditorHost`, `showCode`, `codeOpened`) logic untouched apart from moving it under the new wrapper. Update `HandEditPanel`'s props (`onClose`, `onTabChange`, `title`) and the mock of `TweakPanel` in its test to the new props.
- [ ] **Step 4: Run PASS** the web canvas folder; `pnpm typecheck`; `pnpm check:astryx`.
- [ ] **Step 5: Commit** `feat(canvas): automatic selection, header Undo/Redo, panel only when selected`.

---

### Task 8: A proper Code view

**Files:** Create `.../live/code-theme.ts`, `code-theme.test.ts`; modify `.../live/code-editor.tsx`, `live-panel.tsx` (`LiveCodeView` uses the same look); add direct deps.

**Interfaces — Produces:** `codeExtensions(dark: boolean): Extension[]`, `codeColours: { dark: Palette; light: Palette }`, `contrastRatio(a: string, b: string): number` (exported for the test), `isDarkBackground(cssColor: string): boolean`.

- [ ] **Step 1: Add deps:** `pnpm --filter @meld/web add -E @codemirror/language@6.13.1 @lezer/highlight@1.2.5` (both already in the pnpm store; commit the lockfile).
- [ ] **Step 2: Failing test** `code-theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { codeColours, contrastRatio, isDarkBackground } from "./code-theme";
describe("code theme", () => {
  it.each(["dark", "light"] as const)("%s palette keeps every syntax colour readable", (mode) => {
    const p = codeColours[mode];
    for (const key of ["fg", "keyword", "string", "number", "comment", "tag", "attribute", "fn", "type", "property"] as const)
      expect(contrastRatio(p[key], p.bg), key).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.gutter, p.bg)).toBeGreaterThanOrEqual(3);
  });
  it("tells dark from light backgrounds", () => {
    expect(isDarkBackground("rgb(23, 23, 23)")).toBe(true);
    expect(isDarkBackground("rgb(255, 255, 255)")).toBe(false);
  });
});
```
- [ ] **Step 3: Implement** `code-theme.ts`:

```ts
import { bracketMatching, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightActiveLine, highlightActiveLineGutter, lineNumbers, EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";

type Palette = { bg: string; fg: string; gutter: string; line: string; selection: string; keyword: string; string: string;
  number: string; comment: string; tag: string; attribute: string; fn: string; type: string; property: string };
export const codeColours: { dark: Palette; light: Palette } = {
  dark: { bg: "#171717", fg: "#d4d4d4", gutter: "#7a7a7a", line: "#1f1f1f", selection: "#264f78", keyword: "#c586c0", string: "#ce9178",
    number: "#b5cea8", comment: "#7a9a6b", tag: "#569cd6", attribute: "#9cdcfe", fn: "#dcdcaa", type: "#4ec9b0", property: "#9cdcfe" },
  light: { bg: "#ffffff", fg: "#1f2328", gutter: "#6e7781", line: "#f6f8fa", selection: "#b6d7ff", keyword: "#cf222e", string: "#0a3069",
    number: "#0550ae", comment: "#57606a", tag: "#116329", attribute: "#0550ae", fn: "#8250df", type: "#953800", property: "#0550ae" },
};
const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
export function contrastRatio(a: string, b: string) { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }
export function isDarkBackground(css: string) { const m = /(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(css); return !m || (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) < 128; }

export function codeExtensions(dark: boolean): Extension[] {
  const p = dark ? codeColours.dark : codeColours.light;
  return [
    EditorView.theme({
      "&": { backgroundColor: p.bg, color: p.fg, fontSize: "12.5px", height: "100%" },
      ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: "1.6" },
      ".cm-gutters": { backgroundColor: p.bg, color: p.gutter, border: "none" },
      ".cm-activeLine": { backgroundColor: p.line }, ".cm-activeLineGutter": { backgroundColor: p.line, color: p.fg },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: p.selection },
      ".cm-cursor": { borderLeftColor: p.fg },
    }, { dark }),
    syntaxHighlighting(HighlightStyle.define([
      { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword], color: p.keyword },
      { tag: [t.string, t.special(t.string), t.regexp], color: p.string },
      { tag: [t.number, t.bool, t.null], color: p.number },
      { tag: [t.comment, t.lineComment, t.blockComment], color: p.comment, fontStyle: "italic" },
      { tag: [t.tagName, t.angleBracket], color: p.tag },
      { tag: t.attributeName, color: p.attribute },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: p.fn },
      { tag: [t.typeName, t.className], color: p.type },
      { tag: [t.propertyName, t.variableName], color: p.property },
    ])),
    lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), bracketMatching(),
  ];
}
```
  (If a ratio test fails, nudge that colour lighter/darker until it passes; do not lower the threshold.)
  In `code-editor.tsx` add `...codeExtensions(dark)` to `createFileEditor`'s extension list (add a `dark: boolean` field to `EditorHandlers`, default derived by the caller from `isDarkBackground(getComputedStyle(document.body).backgroundColor)`), make the editor fill the panel width, show file tabs above the editor only when there is more than one file, move **Copy** and **Download** to a slim top bar as icon buttons (lucide `Copy`, `Download`; names `Copy`, `Download` kept), and render diagnostics as a compact `List density="compact"` under the editor showing `line:column message`. Make `LiveCodeView`'s `CodeBlock` share the same dark/light choice if its API allows; otherwise leave it as the read-only fallback.
- [ ] **Step 4: Run PASS** `code-theme.test.ts` and the existing `code-editor.test.tsx` (update only assertions that depended on the old toolbar layout). **Step 5: Commit** `feat(canvas): a proper code view with line numbers and syntax colours`.

---

### Task 9: Shape property panel

**Files:** Create `.../chrome/shape-style.ts`, `shape-style.test.ts`, `shape-panel.tsx`, `shape-panel.test.tsx`; modify `.../excalidraw-board.tsx`, `chrome/selection-pill.tsx` (+ test).

**Interfaces — Produces:**

```ts
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type ShapeStyle = { fill: string | null; stroke: string; strokeWidth: number; strokeStyle: StrokeStyle; rounded: boolean; opacity: number };
export function readShapeStyle(element: { backgroundColor: string; strokeColor: string; strokeWidth: number; strokeStyle: string; roundness: unknown; opacity: number }): ShapeStyle;
export function shapePatch(change: Partial<ShapeStyle>): Record<string, unknown>;   // Excalidraw element props to apply
export function ShapePanel(props: { style: ShapeStyle; kind: "shape" | "text"; onChange: (change: Partial<ShapeStyle>) => void; onTextSize?: (px: number) => void; textSize?: number; onClose: () => void }): JSX.Element
```

- [ ] **Step 1: Failing tests** `shape-style.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readShapeStyle, shapePatch } from "./shape-style";
describe("shape style mapping", () => {
  it("reads Excalidraw props into panel terms", () => {
    expect(readShapeStyle({ backgroundColor: "transparent", strokeColor: "#1e1e1e", strokeWidth: 2, strokeStyle: "dashed", roundness: { type: 3 }, opacity: 80 }))
      .toEqual({ fill: null, stroke: "#1e1e1e", strokeWidth: 2, strokeStyle: "dashed", rounded: true, opacity: 80 });
  });
  it("turning fill on makes it solid, off makes it transparent", () => {
    expect(shapePatch({ fill: "#ff0000" })).toEqual({ backgroundColor: "#ff0000", fillStyle: "solid" });
    expect(shapePatch({ fill: null })).toEqual({ backgroundColor: "transparent" });
  });
  it("maps the remaining fields and clamps", () => {
    expect(shapePatch({ stroke: "#000000", strokeStyle: "dotted", rounded: false, strokeWidth: 12, opacity: 140 }))
      .toEqual({ strokeColor: "#000000", strokeStyle: "dotted", roundness: null, strokeWidth: 8, opacity: 100 });
    expect(shapePatch({ rounded: true })).toEqual({ roundness: { type: 3 } });
  });
});
```
  and `shape-panel.test.tsx`: renders `Fill`, `Stroke`, `Thickness`, `Style`, `Corners`, `Opacity` controls; choosing a fill swatch calls `onChange({fill:"#…"})`; `None` in Fill calls `onChange({fill:null})`; choosing `Dashed` calls `onChange({strokeStyle:"dashed"})`; thickness/opacity commit on Enter/blur with plain-language errors ("Use a whole number, like 2."); for `kind="text"` only colour and size controls render (labels `Colour`, `Size`).
- [ ] **Step 2: Run FAIL.**
- [ ] **Step 3: Implement.** `shape-style.ts` exactly per the tests (clamp thickness 1–8, opacity 0–100). `ShapePanel` uses `LivePanel`-style chrome (title `Shape` or `Text`, `Close`), `ColourField` (Fill with `onClear` → `None`; Stroke), `NumberInput`/`TextInput` for Thickness (`px`) and Opacity (`%`), `Selector` for Style (Solid, Dashed, Dotted) and Corners (Square, Rounded). In `excalidraw-board.tsx`: when `selection` exists with `kind` `shape` or `text` and `access === "edit"`, render `ShapePanel` in the `end` slot (takes priority over the live panel); read the first selected element with `api.getSceneElements()` and `readShapeStyle`; `onChange` → the existing `updateSelected(element => newElementWith(element, shapePatch(change)))` helper (text size keeps using the existing font-size scene update). `Close` clears the selection (`api.updateScene({ appState: { selectedElementIds: {} } })`). In `selection-pill.tsx` delete the colour swatches, `Thin`/`Bold`, and `S/M/L` text controls and their props (`swatches`, `onStroke`, `onStrokeWidth`, `onFontSize`); for `kind !== "screen"` the pill renders only `shapeActions` (and nothing if there are none). Remove the now-unused `swatches` plumbing from the board.
- [ ] **Step 4: Run PASS;** `pnpm typecheck`; `pnpm check:astryx`. **Step 5: Commit** `feat(canvas): a property panel for drawn shapes; remove the shape bar`.

---

### Task 10: Browser acceptance, visuals, full verification

**Files:** Modify `e2e/canvas-excalidraw-live.spec.ts`, `e2e/canvas-excalidraw-chrome.spec.ts`.

- [ ] **Step 1: Update tests that assumed the old flow** (run the live spec first and fix each failure deliberately): tests that clicked `Pick` now click the element directly (`panel` appears on click); tests that clicked inside a woken screen to use it (`Log in`, the counter's `Count 0`) first press the pill's `Interact` toggle; the picked-colour spec opens `Background colour`, picks a swatch or types `#123456` into `Hex` and presses Enter; the conflict/conversion specs keep working through the pill's `Code` button; the "panel toHaveCount(0)" assertions now assert the panel is absent until selection.
- [ ] **Step 2: New browser tests** (append to the live spec, using the existing `openRoomBoard`/`pasteCode`/`doubleClickScreen` helpers):
  1. *Select without Pick:* paste `<button className="bg-red-500 p-3 text-white">Start</button>`; double-click to wake; assert no `live-panel`; click the button inside the frame; assert `live-panel` visible with `Tweak` active and `Padding` showing `12`; press Escape once → panel gone and the screen still awake; Escape again → asleep.
  2. *Real values and controls:* after selecting, `Width` and `Height` have numeric values; set `Weight` to `Bold` and `Font` to `Mono`; assert the iframe button's computed `font-weight` is `700` and `font-family` contains `monospace`; selection (outline `[data-orion-overlay]` in the frame) is still present after the edit.
  3. *Colour picker:* open `Background colour`, choose a swatch → computed background changes; invalid hex shows the plain message.
  4. *Interact:* with `Interact` on, clicking a counter button increments it and no panel opens; turn it off and the next click selects.
  5. *Header history:* after an edit `Undo` (header) reverts the colour and `Redo` reapplies it; the panel body contains no Undo/Redo.
  6. *Code view:* open Code; the editor shows line numbers (`.cm-lineNumbers`) and at least two distinct token colours in the first line's spans.
  7. *Shapes* (chrome spec): draw a rectangle, assert the old `Thin`/`Bold` bar is gone and a `Shape` panel appears; set Fill to a swatch and assert the element's `backgroundColor` and `fillStyle:"solid"` via `window.__orionBoard.api.getSceneElements()`; set Style `Dashed`, Thickness `4`, Opacity `50` and assert the element props; `Close` clears the selection.
- [ ] **Step 3: Visual pass.** Using a throwaway spec (delete it afterwards), save dark-theme screenshots to `.context/inspector-*.png`: nothing selected (no panel), element selected (full panel), colour popup open, Code view, shape panel. Read each image and fix anything cramped, clipped or off.
- [ ] **Step 4: Full verification** (run each and keep logs in `.context/`): `pnpm typecheck && pnpm lint && pnpm check:astryx && pnpm test:colocation && pnpm test:workspace && pnpm test`, then the full Playwright suite with `--timeout=60000` (if a run hangs past ~5 minutes, stop it, free port 3018 and rerun the failing spec alone before concluding anything; report any run that did not complete). Re-inspect the production board bundle for Babel/parse5 leakage only if `screen-compiler.bundle.test.ts` fails.
- [ ] **Step 5: Mac preview.** Rerun `bash .context/plan3-preview.sh` (site on 3107) so the owner can try the redesigned panel; do not claim Mac WebKit verification.
- [ ] **Step 6: Commit** `test: inspector panels through the canvas board`.

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Automatic selection, no Pick; Interact toggle | 2, 3, 7 |
| Panel only when something is selected; Code explicit | 7 |
| Real values from the rendered screen | 2, 3, 4 |
| Font dropdown (Sans/Serif/Mono) + "Showing: <font>" | 1, 4, 6 |
| Weight dropdown with names | 4, 6 |
| Colour picker popup (palette, used, hex) | 5, 6, 9 |
| Number fields with units, auto tag | 4, 6 |
| Plain-language wording | 5, 6, 9 |
| Undo/Redo in the header | 7 |
| Selection kept across edits | 3, 7 |
| Shape panel; shape bar removed | 9 |
| Proper Code view | 8 |
| Tests, screenshots, Mac check | 10 |

## Self-review notes

- Types used across tasks: `Computed` (Task 3, consumed in 4/6/7), `FieldView`/`displayValues` (4 → 6), `ColourField` props (5 → 6, 9), `LivePanel.history` (7), `shiftTag` (7), `ShapeStyle`/`shapePatch` (9). Names are identical everywhere they appear.
- Adding unwritten properties already works in the HTML and JSX adapters (they append an inline style); only the font family field is new engine work.
- Risks to watch while executing: select mode changing how woken screens feel (mitigated by the pill's `Interact`); frame message size (capped, strict schemas); the `Popover`/`NumberInput` APIs (check with `astryx component` before coding Tasks 5–6).
