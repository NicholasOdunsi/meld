# Inspector v2 follow-ups (zoom, one pill, Edit icon, keyboard undo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Three owner follow-ups after testing inspector v2 in the Mac app: (1) the board zoom control misbehaves when a screen is open with the panel showing; (2) a single click on a screen should show the main pill (Edit, Undo, Redo, Code), not a separate Play + Code pill; (3) a better icon for Edit, and ⌘Z / ⇧⌘Z undo and redo the screen edits (not only the pill's buttons), with the screen updating.

**Owner's words (verbatim):**
1. "when it is opened like this the zoom control works in a wierd way" (screenshot: awake screen, panel open on Tweak, zoom control `– 49% +` bottom right of the board, left of the panel).
2. "i dont think we need the play and code control initially single click should activate the main control" (screenshot: a selected, asleep screen whose pill shows Play and Code).
3. "then use a better icon for pick then enable cmd z also so it is not just the undo icon users can click just this ui uodates" (screenshot: the main pill: pointer, undo, redo, code).

**Decisions (made by the controller from the owner's words; record them in your report):**
- "Main control" = the pill from inspector v2 (Edit, divider, Undo, Redo, divider, Code). A single click that selects a screen on the board shows THAT pill. There is no separate Play / "Open live" button any more. The screen itself stays asleep (a picture) until Edit is pressed or it is double-clicked, so selecting, dragging and resizing frames keep working (an awake iframe would swallow the drag).
- ⌘Z applies to the awake screen's edits when it has something to undo; otherwise the keys fall through to the board's own undo exactly as today.

**Tech Stack / worktree:** TypeScript, React 19, Excalidraw, lucide-react 1.26 (has `SquareMousePointer`), Vitest, Playwright. Worktree `/Users/maxuser/conductor/workspaces/meld/canvas-powers-live-paste`, branch `NicholasOdunsi/canvas-powers-live-paste`. Paths below are relative to `apps/web/src/features/canvas-excalidraw` unless they start with `apps/web/e2e` or `packages/`.

## Global Constraints

- Everything from inspector v2 still holds: all literal design values live in `live/inspector-theme.ts`; the pill keeps its look, `data-testid="selection-pill"` on the primary pill, buttons `Edit` (aria-pressed), `Undo`, `Redo`, `Code`; Escape order (popup → selection/pending reselect → leave Edit → sleep); frame message validation, bounded `computed`, pending-select/epoch rules, reselect timers, read-only users see Code (opensCodeOnWake), Tweak-disabled reasons.
- Test commands: web unit `pnpm --filter @meld/web exec vitest run <path>`; screen-runtime `pnpm --filter @meld/screen-runtime exec vitest run`; browser `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts <spec> --timeout=60000` from `apps/web` (ONE spec file at a time, hard timeout, free port 3018 first: `lsof -ti tcp:3018 | xargs -r kill`; NEVER touch port 3107 or the running "Orion Plan3 QA" app). Typecheck/lint/check:astryx as in the earlier plan (`pnpm check:astryx` failing only on `paste/paste-dialog.css` is tolerated).
- Other sessions may commit to this branch: stage only your own files by explicit path; never stash/reset/rebase; do not stage `apps/web/tsconfig.json`, `apps/web/.next-plan3-mac-qa/`, `docs/superpowers/plans/2026-11-20-…`, `.superpowers`, `.context`. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: Zoom control with an open screen

**Files:** `chrome/zoom.ts`, `chrome/zoom-control.tsx`, `excalidraw-board.tsx` (the `ZoomControl` wiring ~line 525), `frame-host.tsx` (the live iframe element ~line 47), their tests, one e2e spec.

**Diagnosis (reproduced in real Chromium, 1440×1000, panel open/closed; screenshots `.context/zoom-1..6-*.png`):** the `–`/`+` buttons keep the iframe, pill and handles in sync with the frame (no lag, no stale width: `appState.width` correctly drops 1440→1144 when the panel opens, label matches zoom). Two real misbehaviours remain:
1. **Pinch / ctrl+wheel over an awake screen does not zoom the board.** The live iframe is `pointer-events:auto`, so the wheel goes into the iframe and never reaches Excalidraw (the same gesture over empty canvas zooms); in a real browser a trackpad pinch there likely triggers page zoom. `chrome/screen-pill.tsx:43-52` already guards its own pill against this; the live frame has no equivalent.
2. **The buttons zoom about the centre of the visible area, not about the open screen** (`chrome/zoom.ts` `zoomAroundCenter`, wired at `excalidraw-board.tsx:525`). With a screen open and the panel shrinking the board, `+` makes the screen slide sideways (frame centre moved 720→757→807 in the measurement) and grow under the panel instead of growing about itself.

**Required behaviour:**
- **Anchor:** `–`/`+` (and the `%` step logic) zoom about the centre of the selected frame when a screen frame is selected, else about the centre of the awake screen's frame when one is awake, else (nothing relevant, or the anchor is outside the visible area) about the centre of the visible board area as today. `zoomAroundCenter` takes an optional anchor point in viewport px in place of the half-width/half-height terms; keep `stepZoom` and the MIN/MAX clamp. The anchor point's scene position must stay fixed on screen across the zoom (assert with a unit test: scene point under the anchor before == after).
- **Wheel/pinch over the live frame:** ctrl+wheel and trackpad pinch (`wheel` with `ctrlKey`, plus the Safari/WebKit `gesturestart/gesturechange` events) over an awake screen's iframe zoom the BOARD the same way as over empty canvas, about the cursor like Excalidraw does, and never page-zoom. Plain (non-ctrl) wheel keeps scrolling the screen's own content. Implement on the parent side where possible (an overlay/capture on the iframe element that only intercepts ctrl+wheel/gestures and re-dispatches an equivalent `wheel` event to Excalidraw's canvas, or computes the same zoom via the board API), and when focus/pointer is inside the iframe document use the runtime bridge only if the parent cannot see the event (check which: in WebKit/Chromium a wheel over a same-process cross-origin sandboxed iframe does not reach the parent) — if the bridge is needed, add a strictly validated minimal message in the same style as `escape`/`picked` (`live/live-messages.ts`, `packages/screen-runtime/src/runtime/bridge.ts`) with bounded numbers and keep every existing protection. Keep Edit-mode pointer handling and the Escape order untouched.
- Do not change panel-open scrolling/centring (out of scope).

- [ ] **Step 1: Failing tests:** `zoom.test.ts`: anchored zoom keeps the anchor's scene point fixed (in and out, clamps at MIN/MAX); fallback to the visible centre with no anchor. Board-level test (component or e2e): with a screen frame selected and the panel open, clicking `+` keeps the frame's on-screen centre fixed (±1px) and the iframe/pill still match the frame; with an awake screen and nothing selected the awake frame is the anchor; with nothing, the visible-area centre. e2e: ctrl+wheel over the awake iframe changes the board zoom (the `%` label and `appState.zoom`), plain wheel over it does not change zoom, and ctrl+wheel over empty canvas still works.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS** (folder, screen-runtime package tests if the bridge changed, typecheck, eslint, check:astryx, the live and chrome e2e specs one at a time). Take before/after screenshots under `.context/fu-zoom-*.png` (panel open, frame selected, `+` three times) and read them.
- [ ] **Step 5: Commit** `fix(canvas): zoom about the open screen and let pinch zoom work over it`.

---

### Task 2: One main pill for every selected screen

**Files:** `live/live-actions.ts`, `live/pill-model.ts`, `excalidraw-board.tsx` (pill wiring only), their tests (`live/pill-model.test.ts`, `chrome/screen-pill.test.tsx` if affected), `apps/web/e2e/canvas-excalidraw-live.spec.ts` and `canvas-excalidraw-chrome.spec.ts` where they used `Open live`.

Today `pillSpecs` gives a selected sleeping screen `Open live` + `Code` (`screenPillItems({ awake: false … })`) and an awake screen the full pill. Make a selected screen show the SAME pill whether it is asleep or awake: `Edit` (icon button, `aria-pressed`), divider, `Undo`, `Redo`, divider, `Code`. Remove the `Open live` (Play) button and its `Play` icon everywhere (code, tests, e2e); no `Open live` button may remain.

Rules:
- On a sleeping selected screen the pill has no history, so Undo and Redo are shown but disabled (same look as the awake pill's disabled state). When the screen cannot be edited (read-only viewer; a screen without editable source), keep today's rule: show only `Code` (no Edit/Undo/Redo) — find where the awake pill decides this (`edit`/`history` undefined) and reuse it; for a sleeping screen whose editability is only known after waking, show Edit and rely on the existing `opensCodeOnWake` behaviour when it turns out to be read-only.
- Pressing `Edit` on a SLEEPING screen wakes it exactly the way a double-click does (interactive, panel NOT opened, nothing selected) and turns Edit on, so the next click on an element selects it and opens the panel. Reuse the existing wake path and `toggleEdit`/`use-select-mode`; do not add a second wake mechanism. Pressing `Edit` again turns it off (same as awake). `Code` on a sleeping screen keeps opening the panel on the Code tab (it wakes the screen as it does today).
- One pill per screen: when the selected frame IS the awake frame, keep the current single awake pill (no duplicate); a selected sleeping frame next to a different awake screen shows its own pill with the extra test id (existing rule).
- `selectedIsLive`/`awake` branching in `screenPillItems` collapses; keep `hostScreenItems` appended as today.

- [ ] **Step 1: Failing tests:** `pillSpecs`/`screenPillItems` for a selected sleeping screen returns Edit, Undo(disabled), Redo(disabled), Code with dividers and NO item labelled `Open live`; read-only/no-edit variant returns just Code; Edit on a sleeping screen calls the wake-and-edit handler (assert the board-level behaviour in a component/unit test that exists for the pill wiring, or in e2e). e2e: select a sleeping screen (single click) → pill shows Edit/Undo/Redo/Code and no `Open live`; press Edit → the screen is awake and interactive, Edit pressed, no panel; click an element → panel opens; migrate every old `Open live` test to this flow, preserving intent, never weakening assertions.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS** (the whole `src/features/canvas-excalidraw` folder, typecheck, eslint, check:astryx, then the affected e2e spec files one at a time). Verify in a real browser screenshot (single click on a sleeping screen; after pressing Edit) under `.context/fu-pill-*.png` and read them.
- [ ] **Step 5: Commit** `feat(canvas): one main pill for every selected screen, no Open live`.

---

### Task 3: A better Edit icon, and ⌘Z / ⇧⌘Z for screen edits

**Files:** `live/live-actions.ts` (icon), `live/use-draft-history.ts`, `excalidraw-board.tsx` (key handling wiring), a small new `live/history-keys.ts` (+ test) if useful, `live/live-messages.ts` and `packages/screen-runtime/src/runtime/bridge.ts` (+ their tests) for keys pressed inside the screen, plus e2e.

1. **Icon.** Replace the Edit button's `MousePointer2` with lucide's `SquareMousePointer` (a pointer inside a square: "pick an element"), same size/stroke as the other pill icons. Update any test that depends on the old icon.
2. **Keys.** With an editable awake screen whose draft has history, `⌘Z` (Ctrl+Z on non-Mac) undoes and `⇧⌘Z` (Ctrl+Shift+Z, and Ctrl+Y) redoes the screen edit, exactly like the pill buttons: same `runHistory` path via `useDraftHistory` (selected element kept, panel carry/invalidate kept, screen updates, panel fields update). Rules:
   - Applies when focus is on the board, the pill, or inside the screen. When focus is in a text field, the native text undo wins: any `input`, `textarea`, contenteditable, or `.cm-editor` (the Code tab and the panel handle their own keys; keep `hand-edit-panel.tsx` behaviour and its guard unchanged).
   - Only when there is something to do: undo only if `canUndo`, redo only if `canRedo`. Otherwise do nothing special and let the keys reach the board's own undo/redo exactly as today. When handled: `preventDefault()` and stop propagation (capture phase) so Excalidraw does NOT also undo a board element.
   - Not while read-only, not when no editable screen is awake, not mid-IME composition, not with Alt.
   - Keys pressed INSIDE the screen's iframe never reach the parent document, so the runtime bridge must forward them: in `packages/screen-runtime/src/runtime/bridge.ts`, next to the existing Escape forwarding, post a new minimal message (e.g. `{ type: 'history', direction: 'undo' | 'redo' }`) for ⌘Z/⇧⌘Z/Ctrl+Y when `!event.defaultPrevented` and the target is not an editable element in the screen (so a screen's own inputs keep native undo). Add the message to the host-side validated schema in `live/live-messages.ts` (strict shape, no extra fields, same validation style as `escape`/`picked`), handle it in the live controller/board by running the same history action, and keep every existing protection (frame message validation, bounded fields, epoch rules). Update `packages/screen-runtime` tests and the bundle/size checks that exist for the runtime string.
3. Update the comment in `live/use-draft-history.ts` ("with no panel, the board's undo takes the keys") to the new behaviour.

- [ ] **Step 1: Failing tests:** unit: key-decision function (undo/redo/ctrl+y/shift, Mac meta vs ctrl, text-field target ignored, nothing-to-undo falls through, read-only ignored, IME ignored); message validation accepts only `undo`/`redo`, rejects extra fields/other values; runtime bridge posts `history` for ⌘Z in the frame but not inside an `<input>` and not when the screen prevented the default; the pill's Edit button renders the SquareMousePointer icon (e.g. by its lucide class `lucide-square-mouse-pointer`). e2e: after a Tweak edit (e.g. Weight → Bold), `Meta+z` / `Control+z` with focus on the board (panel closed or open) reverts it, `Shift+Meta+z` redoes it, the selected element stays selected, the board's own undo is NOT triggered (a drawn rectangle is not removed), and with nothing to undo `Meta+z` still reaches the board's undo (a drawn rectangle is removed); and the same keys work when focus is inside the screen after picking an element.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS** (folder, screen-runtime package tests, typecheck, eslint, check:astryx, affected e2e spec files one at a time). Read a screenshot of the pill with the new icon under `.context/fu-icon-*.png`.
- [ ] **Step 5: Commit** `feat(canvas): a clearer Edit icon and ⌘Z for screen edits`.

---

### Task 4: A clean scrollbar inside screens, and no id tooltip

**Files:** `frame-host.tsx` (iframe `title`), the board-frame document builder (`buildBoardFrameDocument`, find it with grep; also the live/thumbnail documents built from the same function), their tests, one e2e assertion.

Owner: "i need you to clean the scroll bar you add no need for a background" (screenshot: the awake screen's right edge shows a scrollbar with a dark grey TRACK band behind a light thumb, next to the selection outline). The scrollbar is the browser's classic scrollbar inside the screen's iframe; nothing of ours styles it. Make it quiet: a thin scrollbar whose TRACK is fully transparent (no background band, no border) and whose thumb is a subtle rounded bar that reads on both dark and light screens (a translucent neutral, e.g. thumb `rgba(128,128,128,.45)`, slightly stronger on hover). Do it by injecting a low-priority default stylesheet into the screen document BEFORE the screen's own styles so a screen that styles its own scrollbar still wins: standard `scrollbar-width: thin; scrollbar-color: <thumb> transparent` on `html` (Chromium 121+ and recent WebKit honour it) AND `::-webkit-scrollbar{width/height:8px}`, `::-webkit-scrollbar-track{background:transparent}`, `::-webkit-scrollbar-thumb{background:…;border-radius:…;border:2px solid transparent;background-clip:padding-box}`, `::-webkit-scrollbar-corner{background:transparent}` as the fallback. Careful: where `scrollbar-color` is set Chromium ignores `::-webkit-scrollbar`; pick the combination that gives a transparent track in BOTH Chromium and WebKit (check in Chromium for real; say what you could not verify in WebKit). It must apply to the live iframe and to the asleep thumbnail document. Do not change the screen's layout width (use an overlay-like thin bar; if the track width changes layout, say so).

Also fix the native tooltip in the owner's third screenshot: hovering a live screen shows "Live screen ds-d68c53d0-…" because the iframe has `title={`Live screen ${screenId}`}` (`frame-host.tsx:42`; the asleep one has `title="Screen …"`). Remove the browser tooltip while keeping an accessible name: drop `title` and use `aria-label` with a friendly name that does not contain the id (e.g. "Live screen" / "Screen"; use the screen's name if it is already available to the component without new plumbing). Update tests/e2e that located the iframe by its title (`data-orion-live`/`data-orion-frame` attributes exist), without weakening them.

- [ ] **Step 1: Failing tests:** the generated screen document contains the default scrollbar stylesheet BEFORE the author's own `<style>`/content (assert order) and contains a transparent track rule; a screen with its own `::-webkit-scrollbar` rule is not overridden (specificity/order); iframe has no `title` attribute and has an `aria-label` without the screen id; e2e/real-browser measurement: in Chromium the iframe's scrollbar track is transparent (e.g. screenshot pixel check or computed `scrollbar-color`), screenshot `.context/fu-scroll-*.png` of an awake tall screen's right edge, read it.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS** (folder, typecheck, eslint, check:astryx, affected e2e specs one at a time).
- [ ] **Step 5: Commit** `fix(canvas): a quiet transparent scrollbar in screens and no id tooltip`.

---

### Task 5: Text with other things inside it is editable (one text run)

**Files:** `packages/screen-runtime/src/edit/html.ts`, `edit/jsx.ts`, `edit/patch.ts` (+ a small `runs()` helper), `edit/types.ts` only if needed, their tests (`edit/html.test.ts`, `edit/jsx.test.ts`, …); `apps/web/src/features/canvas-excalidraw/live/inspector-values.ts`, `live/tweak-panel.tsx`, `live/element-tag.ts` tests, their tests; e2e.

Owner: "i noticed a lot of text content are not editable" (screenshots: picked `READY TO <span>RIDE?</span>`, `CHASE THE<br><span>FREEDOM.</span>`, `FEATURED <span class="accent">BIKES.</span>` in a pasted HTML bike-shop page). Diagnosis (reproduced with the real engine and a rendered `TweakPanel`, in `.context/diag-out.txt` and `remap-out.txt`):
- Pasted HTML stays one `index.html`; `compile.ts:135` stamps `data-orion-src="file:start:end"`; a click picks the innermost tagged element, so bare text nodes can never be picked; `inspect`/`tweak` (`edit/index.ts:36-68`) re-parse and match by exact offsets.
- Text is editable ONLY when the element has exactly ONE child and it is a text node (`html.ts:131-148`; JSX `jsx.ts:38-68`, which also accepts one `{"literal"}`). Any text + `<br>` / `<span>` / `<svg>` / comment mix has no Text field, so headings like the three above, the hero h1, `VELO<span>X</span>` logos, nav/footer logos, and `<a>Explore <svg/></a>` buttons have NO Text field at all.
- The panel silently HIDES the Content section when `!text.editable && value===null` (`inspector-values.ts:118`, `tweak-panel.tsx:158`); the "Set by the screen's code. Change it in Code." note for text (`tweak-panel.tsx:161`) is dead code because `descriptor` (`patch.ts:19-31`) only sets `value` from a binding. No explanation is given.
- Typography/layout fields stay editable on all of these.
- Bug A: clearing text to "" in HTML gives `<p></p>`, which then has zero children, so the Text field vanishes (user stuck until Undo).
- Bug B: focusing then blurring the Text box on multi-line text writes an edit (and re-indents the source) because `LiteralField.commit` (`tweak-panel.tsx:64-76`) compares the trimmed text with the untrimmed `submitted` value; seen on `p.hero-description` and `a.btn`. Each such blur adds a history entry.

**Required behaviour:**
- **Single-run rule.** An element is text-editable when it has exactly ONE non-blank direct text run, whatever other children it has (elements, `<br>`, comments, whitespace-only text). `Text` shows that run (whitespace-collapsed and trimmed for display); the patch rewrites ONLY that run's source range and keeps the run's original leading/trailing whitespace (so `FEATURED ` + `<span>` never becomes `NEW<span>`); other children are untouched. HTML writes `htmlText(trimmed)` (escapes `& < >`); JSX writes `{JSON.stringify(v)}` computed from the run's semantic text (Babel literal-child cleaning: trim around newlines, join lines with a space, keep meaningful edge spaces). Skip `<pre>` and elements with `white-space:pre*`. Raw-text tags stay excluded.
- **Read-only reason, not silence.** When text is NOT editable (more than one non-blank run, `{expression}`/template children, etc.) the Content section stays visible with the Text field DISABLED showing the element's static text (with `…` if multiple runs; first run is fine) and the existing note "Set by the screen's code. Change it in Code." (alive again): make `Binding.make` nullable and derive editable from it in `patch.ts`; only hide Content when the element has no text at all and no children that could have text.
- **Empty elements:** an element with no children but also no `{expression}` (e.g. `<p></p>` after clearing) stays editable: typing inserts the text between the open/close tags (fixes Bug A).
- **Bug B:** compare normalised values, so an untouched focus+blur does not call `onTweak` and does not add a history entry.
- **Multiple runs are Task 6** (do not build it here); they get the read-only reason for now.
- Undo/redo: no change to history machinery. A run edit stays inside the element, so `shiftTag`/`remapTag` in `hand-edit-panel.tsx` / `element-tag.ts` must stay correct: add tests for replace/grow/empty/no-op run edits and undo, and a picked span AFTER a sibling-run edit shifting correctly.
- Frame message limits stay (bounded strings); keep every existing protection. The picked element keeps its `data-orion-src` identity after the edit (existing reselect rules).

- [ ] **Step 1: Failing tests:** engine (`html.test.ts`, `jsx.test.ts`): text+`<span>`, text+`<br>`+`<span>`, `<a>Explore <svg/></a>`, `<button><svg/> Go</button>`, `<li>Two <b>x</b></li>`, comments/whitespace, entities (`&amp; &nbsp; &rarr;` shown decoded, written as literal characters), text with `{`/`<`/`&`, multi-line text normalisation, two non-blank runs → read-only with a reason and value, JSX `{name}`/template child → read-only, `<pre>` excluded, empty element insert, tweak range stays inside the element. Panel (`inspector-values.test.ts`, `tweak-panel.test.tsx`): read-only text is shown disabled with the note (not hidden); untouched focus+blur on multi-line text never calls `onTweak`; editable mixed-content text commits once. Remap (`element-tag.test.ts`): run edits + undo + picked span after the edited run. e2e (`canvas-excalidraw-live.spec.ts`, paste an HTML page with `<h2>FEATURED <span class="accent">BIKES.</span></h2>`): pick the h2, Content Text shows `FEATURED`, change it to `NEW`, the screen shows `NEW BIKES.` with the span's style intact, Undo restores, the span can still be picked and edited separately.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS** (screen-runtime package tests, the canvas folder, typecheck, eslint, check:astryx, the live spec alone). Screenshot the panel for the three owner headings under `.context/fu-text-*.png` and read them.
- [ ] **Step 5: Commit** `feat(canvas): text next to other elements is editable; read-only text says why`.

---

### Task 6: Several text runs in one element (hero headings)

**Files:** `packages/screen-runtime/src/edit/types.ts`, `edit/index.ts`, `edit/patch.ts`, `edit/html.ts`, `edit/jsx.ts`, `packages/screen-runtime/src/**/screen-compiler`-side zod schemas (`apps/web/.../live/screen-compiler.ts:19-21` strict zod), `live/inspector-values.ts`, `live/tweak-panel.tsx`, `live/hand-edit-panel.tsx`, `live/hand-editing.ts` (+ tests), e2e.

An element like the hero `<h1>RIDE<br>BEYOND<br><span class="accent">LIMITS.</span></h1>` (and `CHASE THE<br>FREEDOM.` when both lines are plain text) has several non-blank text runs separated by `<br>` or elements. After Task 5 these are read-only with a reason; make each run editable.

**Required behaviour:** the engine reports the element's text runs (`runs: string[]`, bounded: at most 8 runs, each at most the existing text limit; more → read-only with the reason) and the tweak message carries `index` (integer 0-7) selecting the run; the patch rewrites only that run's source range. The Content section shows ONE Text field per run in order, each with the same look as the Text field, accessible names `Text`, `Text 2`, `Text 3` (the first stays `Text` so existing tests/e2e keep working), keyed by run index so focus/pending/carry rules behave as for single fields; an element with one run still shows exactly one `Text` field. Extend the strict frame/compile message schemas with the new fields in the same validated style (strict shape, bounds, integer index; reject extras), add the new fields to the `FieldState`/`Tweak` types, and keep backwards compatibility for messages without `runs`/`index`. Undo/redo and `remapTag` as in Task 5 (a run edit changes only that run's range; later runs' ranges shift by the delta — the element's end shifts; tests for editing run 1 then undoing, then editing run 2, picked child span after edits).

- [ ] **Step 1: Failing tests:** engine: runs for `RIDE<br>BEYOND<br><span>LIMITS.</span>` (two runs: RIDE, BEYOND) and `CHASE THE<br><span>FREEDOM.</span>` (one run), tweak with `index` rewrites only that run, out-of-range index rejected, >8 runs read-only; schema accepts/rejects (extra fields, non-integer index, oversize runs); panel: N fields for N runs, names `Text`, `Text 2`, editing the second commits `index: 1`, single-run elements unchanged; remap tests; e2e: paste the hero h1 HTML, pick it, two Text fields; change the second to `FURTHER`, the screen updates, the span is untouched, Undo restores.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS** (screen-runtime tests, the canvas folder, typecheck, eslint, check:astryx, the live spec alone, the screen-runtime bundle checks). Screenshot under `.context/fu-runs-*.png` and read it.
- [ ] **Step 5: Commit** `feat(canvas): every text run in a heading is editable`.

---

## Final verification (controller)

Whole-plan review, then `pnpm typecheck`, lint, `check:astryx`, `test:colocation`, `test:workspace`, `pnpm test`, and each canvas e2e spec file alone with a hard timeout; relaunch nothing on port 3107 (the dev server there is live; just ⌘R in the Mac app).
