# Inspector v2 (pill + Figma-style panel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the canvas screen pill and the side inspector so they look and behave like a design tool (Figma/Paper/Framer): a dock-styled pill that carries Edit, Undo, Redo and Code; a compact inspector with uniform fields, inline icon labels, collapsible sections and no clutter.

**Architecture:** Screens stay interactive by default (double-click wakes them; clicks work). The pill's **Edit** toggle turns on element picking (what was "select mode"); Edit replaces Interact with the inverse default. Undo/Redo move from the panel header to the pill, so history logic is lifted out of `HandEditPanel` into a shared module. The inspector surface (pill, panel shell, fields, colour rows, shape panel) is built from small custom components styled by ONE theme file, matching the approved mock exactly.

**Tech Stack:** TypeScript, React 19, CodeMirror 6, Excalidraw, lucide-react icons, Vitest, Playwright, pnpm workspace (`@meld/web`).

**Approved design:** the mock at `.context/inspector-v2-refs/mock.png` (source `.context/inspector-v2-refs/mock.html`: copy its exact sizes, colours, radii, spacing) and the owner's reference screenshots in `.context/inspector-v2-refs/ref-*.png` (Paper / Figma / design-tool panels; `ref-old-pill.png` and `ref-old-panel.png` show what is being replaced). Worktree: `/Users/maxuser/conductor/workspaces/meld/canvas-powers-live-paste`, branch `NicholasOdunsi/canvas-powers-live-paste`. Paths `.../` below mean `apps/web/src/features/canvas-excalidraw`.

## Global Constraints

- **Astryx exception (owner-approved):** the inspector surface (pill, panel shell, fields, colour rows, shape panel) may use custom elements and CSS instead of Astryx components, so it can match the mock exactly. Astryx may still be used where convenient (e.g. `Tooltip`, `Popover`). All literal design values (colours, sizes, radii, shadows, fonts) live in ONE file `live/inspector-theme.ts` (a CSS-variables object plus class strings or a small stylesheet string injected once); components reference variables only. If `pnpm check:astryx` flags that file, add it to the checker's allowlist in `scripts/check-astryx-conventions.mjs` with a comment citing this exception. No other file may gain a hardcoded colour/px violation.
- **Look (from the mock, dark):** panel surface `#1c1c1c`, divider `#2a2a2a`; fields: height 34, radius 9, background `#2a2a2a`, text `#ececec`, inline label/icon `#8c8c8c`, muted value text `#7f7f7f`; section title 12.5px/600 `#e4e4e4` with a right-aligned collapse chevron `#8a8a8a`; Tweak/Code segmented control (`#262626` track, `#3a3a3a` active); pill and dock surface `#262626`, border `1px #3a3a3a`, radius 16, shadow `0 8px 24px rgba(0,0,0,.5)`, buttons 34px radius 10, active = `#e8e8e8` background with `#111` icon, disabled icon `#6b6b6b`, 1px dividers `#3d3d3d`. The board is always dark. All fields of ALL kinds (text, number, dropdown, colour) share the same height, background, radius and padding.
- **Copy/names that tests rely on (keep exactly):** buttons `Edit` (aria-pressed toggle), `Undo`, `Redo`, `Code`, `Open live`, `Close`; tabs `Tweak`, `Code`; field accessible names `Text`, `Font`, `Size`, `Weight`, `Text colour`, `Background colour`, `Width`, `Height`, `Padding`, `Gap`, `Corner radius` (a unit suffix is NOT shown; names are provided via aria-label); shape panel names `Fill`, `Stroke`, `Thickness`, `Style`, `Corners`, `Opacity`; `data-testid` values `live-panel`, `shape-panel`, `selection-pill`, `canvas-dock` stay. Error copy stays verbatim ("Use a whole number, like 8.", "Use a colour like #1A2B3C."). The "Add to chat…" note/button is removed from the Tweak body until chat exists.
- Removed from the UI: the element-name line above Content; `Showing: <font>` (the font name moves inside the Font row as muted text); the text "auto" under W/H (becomes a small icon inside the field with tooltip "Auto size"); the panel header title ("Screen"/"Shape" text), Undo/Redo/Interact in the panel header; the "Interacting" chip.
- Behaviour rules: double-click wakes a screen interactive (panel does NOT open; nothing selected). `Edit` off = clicks reach the screen. `Edit` on = clicking an element selects it (outline) and opens the panel; Edit off clears selection and closes the panel (unless the Code tab was explicitly opened). Escape order: inside a popup → close it only; with a selection (or pending reselect) → clear selection, stay in Edit; else in Edit → leave Edit; else sleep the screen. Undo/Redo keep the selected element (existing `remapTag` behaviour) and work whether or not the panel is mounted. The pill shows for every awake screen the user may edit (and for a selected asleep screen with `Open live` + `Code`), anchored under the screen's frame whether or not the frame is selected on the board.
- Keep all existing protections: frame message validation, bounded `computed`, pending-select/epoch rules, reselect timers, read-only users see Code (opensCodeOnWake), Tweak tab disabled reasons.
- Test commands: web unit `pnpm --filter @meld/web exec vitest run <path>`; browser `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts <spec> --timeout=60000` (ONE spec file at a time, hard timeout, free port 3018 first: `lsof -ti tcp:3018 | xargs -r kill`; never touch the Mac preview site on port 3107). Other session may commit paste-dialog work to this branch: stage only your own files by explicit path; never stash/reset/rebase. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File map

| File | Task | Responsibility |
|---|---|---|
| `live/selection-rules.ts`, `live/use-inspector-panel.ts`, `live/use-select-mode.ts`, `live/hand-editing.ts` (+tests) | 1 | Interact→Edit inversion, Escape order, remove chip/header toggles |
| `live/draft-history.ts` (new), `live/use-draft-history.ts` (new), `live/hand-edit-panel.tsx` (+tests) | 1 | history (undo/redo + reselect remap) usable without the panel |
| `chrome/screen-pill.tsx` (new, replaces `selection-pill.tsx` + `interact-chip.tsx`), `live/live-actions.ts`, `excalidraw-board.tsx` (+tests) | 2 | the dock-styled pill |
| `live/inspector-theme.ts` (new), `live/inspector-ui.tsx` (new: `Section`, `FieldShell`, `TextField`, `NumberField`, `SelectField`, `ColourRow`, `IconGlyph`) (+tests) | 3 | field primitives |
| `live/tweak-panel.tsx`, `live/field-text.ts` (+tests) | 3 | Figma-style Tweak body |
| `live/live-panel.tsx`, `live/hand-edit-panel.tsx`, `live/code-editor.tsx` chrome (+tests) | 4 | panel shell: tabs + close, Code tab look |
| `chrome/shape-panel.tsx`, `live/colour-field.tsx` (+tests) | 5 | shape panel + colour popup restyle |
| `e2e/canvas-excalidraw-live.spec.ts`, `e2e/canvas-excalidraw-chrome.spec.ts` | 6 | acceptance, screenshots, full verification |

---

### Task 1: Edit mode (inverse of Interact) and history that works without the panel

**Files:** modify `live/selection-rules.ts`, `live/use-inspector-panel.ts`, `live/use-select-mode.ts`, `live/hand-editing.ts` (escape consumer naming only if needed), `live/hand-edit-panel.tsx`; create `live/draft-history.ts`, `live/use-draft-history.ts`; modify matching tests (`selection-rules.test.ts`, `use-inspector-panel.test.tsx`, `use-select-mode.test.tsx`, `hand-edit-panel.test.tsx`, `hand-edit-panel.carry.test.tsx`).

**Interfaces — Produces:**
```ts
// selection-rules.ts
export function shouldEnableSelectMode(i: { phase: LiveState["phase"]; hasDraft: boolean; canEdit: boolean; edit: boolean }): boolean; // edit replaces interact; true only when edit
export type EscapeAction = "ignore" | "clear-selection" | "exit-edit" | "sleep";
export function escapeAction(i: { hasPick: boolean; targetInsidePopup: boolean; edit: boolean }): EscapeAction; // popup→ignore; pick→clear-selection; edit→exit-edit; else sleep
export function showScreenPill(i: { phase: LiveState["phase"]; access: "edit" | "view"; hasDraft: boolean; editable: boolean }): boolean;
// use-inspector-panel.ts returns { ..., edit: boolean, toggleEdit(): void }  (no `interact`, no `toggleInteract`)
// draft-history.ts
export type HistoryKind = "undo" | "redo";
export function runHistory(kind: HistoryKind, ctx: { draft: Draft; live: LiveController; boardId: string; picked: Selected | null; reselect: string | null; onReselect: (src: string | null) => void }): boolean; // does what HandEditPanel.edit("history") does today (draft.undo/redo, remapTag of the pick or pending reselect, live.previewDraft)
// use-draft-history.ts
export function useDraftHistory(editing: HandEditing): { canUndo: boolean; canRedo: boolean; undo(): void; redo(): void } | null; // null when no editable drafted screen is awake
```

- [ ] **Step 1: Failing tests.** `selection-rules.test.ts`: `shouldEnableSelectMode` is false by default (`edit:false`) and true for awake+draft+canEdit+`edit:true`; `escapeAction` table (popup→ignore; pick→clear-selection even in edit; edit without pick→exit-edit; neither→sleep); `showScreenPill` (awake+edit access+drafted+editable → true; view access → false; asleep → false). `use-inspector-panel.test.tsx` (existing real-controller style): a woken editable screen has `edit === false`, panel not visible, picking disabled; `toggleEdit()` turns picking on; clicking (simulated `picked`) shows the panel; `toggleEdit()` off clears the selection and hides the panel (unless Code open); Escape sequence with pick → clear → exit-edit → sleep; the frame `escape` message path follows the same order. `draft-history` tests: `runHistory("undo")` calls `draft.undo()`, previews, remaps the pick (reuse the existing hand-edit-panel history cases, moved); `useDraftHistory` returns null for a read-only/undrafted screen and reflects `canUndo/canRedo` of the live screen's draft with NO panel mounted.
- [ ] **Step 2: Run, expect FAIL** (`pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live`).
- [ ] **Step 3: Implement.** Rename `interact`→`edit` everywhere it means "select mode wanted" and INVERT the default (`useState(false)` = interact/live; `useSelectMode(live, editing, edit)` enables picking only when `edit`). Escape: one-shot `editing.setEscapeFirst` consumer is registered while `edit` is on and has no pick: it exits Edit (so a frame-focused Escape follows the same order); the existing frame-Escape path that clears a pick/pending reselect stays first. `toggleEdit`: turning ON does nothing else; turning OFF calls `clearSelection()` and `setPanelOpen(false)` is NOT called (Code stays open if explicitly opened). Reset `edit` to false when the live screen changes or sleeps. Move the body of `HandEditPanel.edit("history", …)` (draft.undo/redo, `remapTag` using `selected.current?.src ?? reselect`, `onReselect`, `live.previewDraft`, `carry`) into `draft-history.ts` `runHistory`, called by both `HandEditPanel`'s ⌘Z handler and `useDraftHistory`; `useDraftHistory` subscribes to the live screen's draft (`editing.drafts.get(liveState.screenId)` + `draft.subscribe`) and `editing.subscribe` so it works with no panel. Delete the Interact chip wiring (`showInteractChip`, `InteractChip` usage in the board is removed in Task 2; here remove `showInteractChip` and the `interact` props from `LivePanel`/`HandEditPanel`; also remove the panel header Undo/Redo — `LivePanel` loses `history`/`interact` props; Task 4 restyles the header). Keep the panel's ⌘Z/⇧⌘Z shortcut.
- [ ] **Step 4: Run, expect PASS**, then the whole folder `src/features/canvas-excalidraw`, `pnpm typecheck`, eslint on changed files. (The board will not compile until Task 2 wires the pill; in THIS task keep the board compiling by passing the new `edit`/`toggleEdit` through the existing `SelectionPill` as a pressed action named `Edit`, and delete the chip usage.)
- [ ] **Step 5: Commit** `refactor(canvas): Edit mode replaces Interact; history works without the panel`.

---

### Task 2: The dock-styled pill

**Files:** create `chrome/screen-pill.tsx`, `chrome/screen-pill.test.tsx`; delete `chrome/selection-pill.tsx`, `chrome/interact-chip.tsx` and their tests (move any still-valid cases into the new test); modify `live/live-actions.ts`, `excalidraw-board.tsx`, `chrome/shape-panel`-independent code only.

**Interfaces — Consumes:** Task 1 `useInspectorPanel().{edit,toggleEdit}`, `useDraftHistory`, `showScreenPill`, `openPanel`, `showCode`. **Produces:**
```ts
export type PillItem =
  | { kind: "button"; label: string; icon: ReactNode; onPress: () => void; disabled?: boolean; pressed?: boolean; tooltip?: string }
  | { kind: "divider" };
export function ScreenPill(props: { bounds: { x: number; y: number; width: number; height: number }; view: { scrollX: number; scrollY: number; zoom: number }; items: readonly PillItem[]; testId?: string }): JSX.Element | null;
export function screenPillItems(i: { awake: boolean; edit?: { pressed: boolean; onToggle: () => void }; history?: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }; onOpenLive: () => void; onCode: () => void }): PillItem[]; // asleep: [Open live, Code]; awake: [Edit?, divider, Undo, Redo, divider, Code]; Undo/Redo only with history; Edit only when editable
```
`data-testid="selection-pill"` stays on the pill (e2e uses it). Items are icon buttons (lucide: Edit=`MousePointer2`, Undo=`Undo2`, Redo=`Redo2`, Code=`CodeXml`, Open live=`Play`) 34×34, radius 10, `aria-label` = label, native `title`/tooltip = tooltip ?? label, `aria-pressed` only when `pressed` is defined, `aria-disabled="true"` when disabled (and ignore clicks). Look per the mock `.pill`: surface/border/radius/shadow from `inspector-theme.ts` (create the file in THIS task with the pill and dock variables; Task 3 adds the rest), anchored centred under the frame with 12px gap using `sceneToContainer` from `chrome/selection.ts` (as the old pill). Also restyle the **left dock** (`chrome/canvas-dock.tsx`) container to the same surface/border/radius/shadow variables so they match (keep its buttons/behaviour/test ids).

- [ ] **Step 1: Failing tests** (`screen-pill.test.tsx`, jsdom): buttons render in order with accessible names; `Edit` has `aria-pressed` true/false and calls `onToggle`; Undo/Redo disabled (`aria-disabled`) when `canUndo/canRedo` false and do not fire; asleep items are exactly `Open live` and `Code`; anchoring transform uses the bounds/view (centre-bottom + gap); returns null for zero items; `screenPillItems` matrix (awake editable / awake read-only → only Code / asleep). Board integration test (extend `use-inspector-panel.test.tsx` or an extracted pure `pillModel` helper): the pill is shown for an AWAKE editable screen whose frame is NOT selected on the board.
- [ ] **Step 2: Run FAIL. Step 3: Implement** `screen-pill.tsx`, `inspector-theme.ts` (pill + dock vars), update `live-actions.ts` (`liveScreenActions` becomes `screenPillItems` or delegates), and the board: render `ScreenPill` (a) for the awake live frame whenever `showScreenPill(...)` — bounds from the live frame element — and (b) for a selected asleep screen (Open live + Code); shape/text selections keep their existing `shapeActions` pill using the same `ScreenPill` look (items from `shapeActionsFor`). Remove the old `SelectionPill`/`InteractChip` imports.
- [ ] **Step 4: PASS** (folder tests, typecheck, eslint, `pnpm check:astryx` — only the other session's `paste/paste-dialog.css` and, if it appears, `inspector-theme.ts` (allowlist it per Global Constraints) may fail). Update `e2e` helpers that used `selectLiveFrame` to reach the pill ONLY if trivial now (the pill is visible without selecting the frame); the e2e rewrite is Task 6.
- [ ] **Step 5: Commit** `feat(canvas): a dock-styled pill with Edit, Undo, Redo and Code`.

---

### Task 3: Field primitives and the Figma-style Tweak panel

**Files:** create `live/inspector-ui.tsx`, `live/inspector-ui.test.tsx`; extend `live/inspector-theme.ts`; rewrite the render parts of `live/tweak-panel.tsx` and `live/tweak-panel.test.tsx` (keep `field-text.ts` and every existing behaviour: commit on Enter/blur/arrow, whole-number errors, px strip, pending/carry, selectionKey resets, code-owned note).

**Interfaces — Produces** (all from `inspector-ui.tsx`, every control is a native element or button styled via theme variables; ids/aria are required):
```ts
export function Section(p: { title: string; children: ReactNode; defaultOpen?: boolean }): JSX.Element;          // title row 12.5px/600 + chevron toggle (button, aria-expanded, aria-label `${title} section`), collapses children; divider above except first
export function FieldShell(p: { icon?: ReactNode; label?: string /*inline letter like "W"*/; trailing?: ReactNode; disabled?: boolean; invalid?: boolean; children: ReactNode }): JSX.Element; // 34px row, radius 9, bg, inline icon/letter, children = the control, trailing = muted text or icon
export function TextField(p: { ariaLabel: string; icon?: ReactNode; value: string; onChange(v: string): void; onCommit(): void; onKeyDown?(e: KeyboardEvent<HTMLInputElement>): void; disabled?: boolean; invalid?: boolean; trailing?: ReactNode }): JSX.Element; // <input> without own border/background, aria-label, inputMode as given
export function SelectField(p: { ariaLabel: string; icon?: ReactNode; value: string | null; options: readonly { value: string; label: string }[]; onChange(v: string): void; trailingText?: string; disabled?: boolean }): JSX.Element; // custom listbox: a button (role combobox, aria-label) opening a popup list (role listbox, options role option) in the SAME look; keyboard: Enter/Space/ArrowDown open, arrows move, Enter pick, Escape close ONLY the list; trailingText = muted text inside the row (e.g. "DM Sans")
export function ColourRow(p: { ariaLabel: string; value: string | null; used: readonly string[]; disabled?: boolean; onChange(hex: string): void; onClear?(): void; canvasFilter?: boolean }): JSX.Element; // same row look: swatch + hex text; opens the EXISTING ColourField popup content (reuse live/colour-field.tsx; Task 5 restyles the popup)
export function AutoIcon(): JSX.Element;  // small lucide `MoveDiagonal` glyph with title "Auto size"
```
Tweak layout (exactly the mock): `Section "Content"` (Text field with `Type` icon), `Section "Typography"` (Font: `SelectField` icon `CaseSensitive`, `trailingText` = `displayFontName(computed.fontFamily)`; row of two: Size `TextField` icon `ALargeSmall` + Weight `SelectField` icon `Bold`; text colour `ColourRow`), `Section "Layout"` (row of two: Width / Height `TextField` with inline letters `W`/`H` and trailing `AutoIcon` when `view.auto`; row of two: Padding icon `SquareDashed`, Gap icon `MoveHorizontal` when not hidden), `Section "Appearance"` (background `ColourRow`, Corner radius icon `SquareRoundCorner`). No element-name line, no per-field labels above, no "Showing:", no "auto" text, no Add-to-chat button/reason. Code-owned fields: disabled field + one small muted line per section "Set by the screen's code. Change it in Code." (keep). Pending state: dimmed, `aria-busy`, same DOM nodes. Number inputs: `inputMode="numeric"`; accessible names from the list in Global Constraints (no " (px)").

- [ ] **Step 1: Failing tests.** `inspector-ui.test.tsx`: Section collapses/expands (aria-expanded, children hidden); TextField commits on Enter/blur via callbacks and shows invalid state (`aria-invalid`); SelectField: click opens listbox, option click calls `onChange` and closes, keyboard path (ArrowDown/Enter/Escape only closes the list — assert the event does not reach a document-level Escape spy because the target is inside the popup: use `role="listbox"` so `POPUP_SELECTOR` matches), `trailingText` shown inside the row; ColourRow opens the colour popup and picks a swatch; every control's root has the same height/background/radius via the shared theme class (assert class names / CSS variable usage, not pixel values). `tweak-panel.test.tsx`: migrate the existing suite to the new primitives keeping every behaviour assertion (commit once on Enter+blur; arrow steps; bad number error text; px strip; whole numbers only; code-owned disabled + note once per section; pending keeps same DOM node + focus; selectionKey reset; refresh test; no raw class names; Font Serif and Weight Bold commit immediately; colour swatch commit), adjust queries to roles/names (`getByRole("textbox",{name:"Padding"})`, `getByRole("combobox",{name:"Font"})`), plus new assertions: no element-name text, no "Showing:", no "auto" text node but an element titled "Auto size" for auto W/H, no "Add to chat".
- [ ] **Step 2: Run FAIL. Step 3: Implement** the primitives and the new Tweak render. Keep `useFieldText` and the commit logic untouched; only swap the controls and layout. Icons come from `lucide-react` (already a dependency).
- [ ] **Step 4: PASS**: whole `src/features/canvas-excalidraw` folder, typecheck, eslint, check:astryx (see Global Constraints for the allowed failures).
- [ ] **Step 5: Commit** `feat(canvas): Figma-style inspector fields and Tweak layout`.

---

### Task 4: Panel shell and Code tab look

**Files:** modify `live/live-panel.tsx`, `live/hand-edit-panel.tsx`, `live/code-editor.tsx` (chrome only), `live/live-panel.test.tsx`, `live/hand-edit-panel.test.tsx`, `live/code-editor.test.tsx`; extend `inspector-theme.ts`.

Panel shell per the mock: a fixed-width (296px) column, surface `#1c1c1c`, left border `1px #2c2c2c`, padding 12/14, scrolls vertically. Header row: left the **Tweak | Code** segmented control (two buttons, `role="tablist"`/`tab`, `aria-selected`; disabled Tweak keeps `aria-disabled="true"` + tooltip text exposed as `title` and accessible description, clicks ignored), right a 30×30 ✕ icon button named `Close`. NO title text, no Undo/Redo/Interact here. `LivePanel` props become `{ tab, onTabChange, onClose, disabledTabs?, onKeyDown?, children }` (drop `title`/`tabs` overrides; keep the single-tab case: if only one tab is passed hide the control). `data-testid="live-panel"` stays on the column. Code tab: the editor fills the column width below a slim top bar (file tabs when >1 file as small pills in the same segmented style, `Copy`/`Download` icon buttons right-aligned 30×30), diagnostics list restyled (same surface, small mono text), keep all behaviour/names/⌘Z handling. `LiveCodeView` fallback keeps working with the new shell.

- [ ] **Step 1: Failing tests:** header contains exactly the two tabs and Close (no `Screen` text, no Undo/Redo/Interact buttons); Tweak disabled behaviour (aria-disabled, reason in description, click ignored, current tab never disabled); Close calls `onClose`; HandEditPanel no longer passes history/interact; the panel column has the shell class; code-editor top bar has Copy/Download and no Undo/Redo (existing) and file tabs only for >1 file in the new style; ⌘Z inside `.cm-editor` still handled by the editor.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS** (folder, typecheck, eslint, check:astryx).
- [ ] **Step 5: Commit** `feat(canvas): panel shell with Tweak/Code tabs and a quieter Code tab`.

---

### Task 5: Shape panel and colour popup in the same language

**Files:** modify `chrome/shape-panel.tsx`, `live/colour-field.tsx` (popup content styling; keep behaviour/exports used by Task 3's `ColourRow`), their tests.

Shape panel (same shell as Task 4 but header = just `Close` ✕ and no tabs): `Section "Fill"` (`ColourRow` with `onClear` → `None`, `canvasFilter`), `Section "Stroke"` (stroke `ColourRow`; thickness `TextField` icon `Minus`-style line-weight glyph with whole-number 1–8 errors; style `SelectField` Solid/Dashed/Dotted icon `Ellipsis`/`Minus`), `Section "Corners"` (SelectField Square/Rounded, only where `applicableControls` says so; icon `SquareRoundCorner`), `Section "Appearance"` (opacity `TextField` 0–100 with trailing `%`). Text selection: Colour + Size only. Keep every existing behaviour: `applicableControls`/`patchFor`, `closed` lines, `canvasFilter` on swatches, selectionKey resets, Enter-then-blur single commit, arrow steps, `data-testid="shape-panel"`. Accessible names: `Fill`, `Stroke`, `Thickness`, `Style`, `Corners`, `Opacity`, and for text `Colour`, `Size`. The colour popup (grid of swatches, "Used on this screen", Hex field) restyled to the mock surface (`#262626` popover, border `#3a3a3a`, radius 12, shadow like the pill, swatches 18px circles with the same hover ring), keeping roving tab stop, arrow-key rows, Escape-closes-popup-only, blur-commit rule, reopen-after-Escape guard.

- [ ] **Step 1: Failing tests** (migrate `shape-panel.test.tsx`/`colour-field.test.tsx` to the new primitives keeping every behaviour assertion; add: no tabs/title text in the shape panel header; Fill row shows `None` state; popup uses the popover surface class). **Step 2: FAIL. Step 3: Implement. Step 4: PASS** (folder, typecheck, eslint, check:astryx). **Step 5: Commit** `feat(canvas): shape panel and colour popup match the inspector`.

---

### Task 6: Browser acceptance, visual pass, full verification

**Files:** modify `e2e/canvas-excalidraw-live.spec.ts`, `e2e/canvas-excalidraw-chrome.spec.ts`; throwaway screenshot spec (delete after).

- [ ] **Step 1: Update specs to the new flow, preserving intent** (run each spec file alone, fix deliberately, never weaken assertions): the screen now stays interactive after waking, so tests that clicked inside a woken screen no longer press Interact; tests that selected elements first press the pill's `Edit` (`getByTestId("selection-pill").getByRole("button",{name:"Edit",exact:true})`); the pill is visible without selecting the frame (remove `selectLiveFrame` where it only existed to reveal the pill; keep it only where a board-level frame selection is under test); Undo/Redo are PILL buttons (not in the panel); the panel header assertions become "tabs + Close only"; number/select field locators lose the ` (px)` suffix and dropdowns are `combobox` buttons opening `listbox`/`option`; Escape sequences follow the new order (clear selection → leave Edit → sleep); the Interacting chip tests are replaced by Edit-toggle tests; the "Add to chat" note assertions are removed.
- [ ] **Step 2: New tests:** (1) double-click wakes → clicking the screen's own button works with no extra step and no panel; (2) pill `Edit` on → click selects, panel opens with `Tweak` active; Edit off → panel closes, clicks work again; (3) Undo/Redo via the pill keep the selection and the panel (Edit on); Undo works with NO selection (pill only); (4) the inspector has no element-name line, no "Showing:", no "auto" text, no "Add to chat" (assert absence); (5) every field control in the Tweak panel has the same computed height and background colour (query `input`, `[role=combobox]`, colour row root; compare `getComputedStyle`); (6) Escape order (popup, selection, Edit, sleep); (7) shape panel: no tabs/title; fill/stroke/thickness/style/opacity still apply (migrate the existing shape test).
- [ ] **Step 3: Visual pass.** Throwaway spec (dark, viewport 1440×1000): screenshots under `.context/v2-*.png`: awake screen with the pill; Edit on with an element selected (full panel); colour popup open; Font dropdown open; Code tab; shape panel; asleep selected screen pill. Read each image and compare with `.context/inspector-v2-refs/mock.png`; fix cramped/misaligned/clipped details (these are code fixes in the files above; commit as `style(canvas): …`). Delete the throwaway spec.
- [ ] **Step 3b: Every other canvas spec** (`e2e/canvas-excalidraw*.spec.ts`) one file at a time with a hard timeout; report counts.
- [ ] **Step 4: Full verification:** `pnpm typecheck && pnpm lint && pnpm check:astryx && pnpm test:colocation && pnpm test:workspace && pnpm test` (the only tolerated failure is the other session's `paste/paste-dialog.css` in `check:astryx`), and the 10-run repeat of the colour-popup tests (`--repeat-each=10`, one worker).
- [ ] **Step 5: Commit** `test: inspector v2 through the canvas board`.

---

## Self-review

- Spec coverage: pill look/contents (Task 2), Edit/Undo/Redo/Code on the pill + double-click interactive + Edit picks (Task 1–2), panel cleanup/header (Task 4), fields uniform + icons + auto icon + font row + no stray text (Task 3), colour rows/popup + shape panel (Task 5), tests/visuals (Task 6).
- Names defined once and reused: `edit`/`toggleEdit` (Task 1 → 2), `useDraftHistory` (1 → 2), `ScreenPill`/`screenPillItems` (2), `Section`/`FieldShell`/`TextField`/`SelectField`/`ColourRow`/`AutoIcon` (3 → 5), `inspector-theme.ts` created in Task 2, extended in 3–5.
- Risks: custom `SelectField` accessibility (keyboard, Escape scope) → covered by tests; the history lift touches carry/reselect logic → keep existing `hand-edit-panel*.test.tsx` cases green; Edit inversion changes many e2e flows → Task 6.
