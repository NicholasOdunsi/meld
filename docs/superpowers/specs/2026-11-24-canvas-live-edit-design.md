# Canvas live edit — change a running app by pointing at it — design

Date: 2026-11-24 · Status: awaiting owner review · Branch: `NicholasOdunsi/canvas-live-edit`

## Read this part first (plain language)

Today, **Preview in Canvas** shows a Build Star's running app (for example Daily Quest)
inside the Star's frame on the Canvas board. You can look at it and click around, but
nothing you do there changes the code. Generated HTML screens feel different because the
screen *is* the code, so Orion can rewrite it. This spec gives real apps the same feel.

**What you'll do:**

1. Open **Preview in Canvas** on a finished Build Star. A pencil button appears in the
   preview frame's header, next to the globe. Turn it on.
2. Hover over the page: the element under your pointer is outlined. Click to select it.
3. A panel opens beside it. It looks like the shape panel you already have (same header,
   sections, colour row and number boxes), and it only shows what applies to what you
   clicked: a heading gets *text* and *colour*; a box gets *fill*, *spacing* and *corners*.
4. **Simple changes are instant and don't use the AI.** Retype text (double-click),
   change colour, size, spacing or corner roundness, or drag the handles. The code file
   changes when you let go and the preview refreshes. Undo and Redo sit in the panel.
5. **Bigger changes are described.** The same panel has a box: "Tell Orion what to change".
   Type "make this a card layout" and send. That goes to the AI agent as a normal build
   request, with the selected element, a screenshot and its position attached, so you
   never have to explain *which* button you mean.
6. If Codex or Claude has hit its usage limit, step 4 still works. Step 5 shows the
   usage-limit message already built.

**What it will not do (version 1):**

- Only Next.js / React apps like Daily Quest (the only kind Preview supports today).
- Nothing is saved to Git automatically. Edits change the files in the build's own
  working copy, exactly like the AI agent's edits do. Committing and pushing stay the
  separate steps they are today.
- No edits while the build is still running or waiting on an approval (so you and the
  agent never change the same file at once).
- Dragging an element to a new position in the page flow is **not** in version 1.
  Resize, spacing, text, colour and corners are. (Drag handles in step 4 mean resize.)
- Shared stylesheets and CSS modules are not edited. A colour or size change is written as
  an inline style on that element (as screen editing does today); Tailwind classes and
  inline styles the element already has are updated in place.
- The describe box sends the selected element's file, line, HTML and styles as text with
  your request. A screenshot attachment is left for later because build requests carry
  text only today.

**How Orion knows which line of code you clicked (tested on Daily Quest, it works):**
React 19 dev builds remember where each element was created, and Next's dev server can
turn that into the real file and line (for example `app/page.tsx:415`). Orion reads it
when you click, so nothing is added to the app's code or build and no repo file changes.
Where a value comes from code rather than being typed in (Daily Quest's big greeting
words are computed), Orion says "can't change this one directly" and offers the describe
box instead of guessing.

## How it works (for the builders)

```
Preview (WKWebView in the Mac app)   Canvas board (web)            Mac app
  selection overlay (injected JS) →  Edit panel (inspector kit)  →  Edit helper (JS file
  hover / click / double-click       shows the right controls        bundled in the app)
        ↑ refresh (dev server reloads)                                   ↓
        └──────────────────── files in the build's working copy ←────────┘
```

### Pieces, one purpose each

1. **Source resolver (runtime, no tagging).** In the preview page, a clicked element's
   React fiber carries `_debugStack`. Its first `webpack-internal:///(app-pages-browser)/./`
   frame names the component's file with compiled coordinates; a POST to the dev server's
   `/__nextjs_original-stack-frames` turns that into `{ file, line1, column1 }` of the
   element's opening `<` in the original source. Verified on Daily Quest (Next 15.5.0,
   React 19.1.0): `<h1>` resolved to `app/page.tsx:415:11`. The preview already runs
   webpack (`next dev` without `--turbopack`). This relies on two Next/React dev-mode
   details, so the helper reports `not-found` (never guesses) if either is missing.
2. **Selection overlay.** A script injected into the preview's WebKit view
   (`WKUserScript`). Highlights on hover, selects on click, reports
   `{resolved file and line, tag name, text, computed style subset, bounding box}` to the Mac app, and
   supports double-click text editing and resize handles. It never navigates or submits
   anything. (The preview is a native overlay, so this lives in the Mac app, not the web
   board.)
3. **Edit panel.** A new web panel in the Canvas board
   (`apps/web/src/features/canvas-excalidraw/chrome/element-panel.tsx`) built from the
   existing inspector kit (`LayoutPanel`, `Section`, `FieldRow`, `ColourRow`,
   `NumberField`, `SelectField`, `PanelCloseButton`). Selection arrives from the Mac app
   over the existing native bridge; edits go back the same way.
4. **Property list (reused).** `@meld/screen-runtime/edit/types` already defines the
   editable fields (`text`, `color`, `backgroundColor`, `fontSize`, `fontWeight`,
   `fontFamily`, `padding`, `gap`, `borderRadius`, `width`, `height`), the `Tweak` format,
   `Inspection` and the `not-found` / `not-literal` results, and `TweakPanel` already
   draws them. The Edit panel reuses all of it; nothing new is invented here.
5. **Edit helper.** One JavaScript file bundled inside the Mac app and run with the same
   Node runtime the preview already uses. It converts the resolved line and column to the
   element's source range, then calls the existing `inspectElement` / `applyTweak`, which
   edit literal text, inline styles and utility classes, and add an inline `style={{ ... }}`
   when an element has no editable style (exactly what screen editing does today). It
   does not edit shared stylesheets in version 1. It reports success with before/after
   contents of each changed file, or `not-found` / `not-literal` / `too-large` /
   `outside-root`. It was chosen over the connector because the Mac app ships
   automatically while connector distribution is still blocked, and because it needs no
   cloud round trip.
6. **Undo stack.** The Mac app keeps before/after contents of each edited file, per Star,
   in a private folder. Undo and Redo replay them. This is separate from Git on purpose
   (decision change from the earlier chat idea of one Git commit per edit: dozens of
   nudge commits would pollute the build's branch).
7. **Describe path.** The box sends a normal build message to the Star (the existing
   `sendStream(..., starTaskID:, build: true)`) whose text starts with a short block: the
   element's file and line, its HTML and its main styles. Reuses the existing queue,
   approvals and failure messages; no contract or database change.

### Rules and edge cases

- **Safe writes.** The helper only touches files inside the Star's recorded working copy
  (the same check `BuildPreview.worktree(for:)` already does), refuses paths with `..`
  or symlinks out, and only accepts typed values: colours must be valid CSS colours,
  numbers are clamped to the property's range, text is length-limited.
- **Not found / not literal.** If the element can't be resolved, the line no longer matches (the
  file changed), or the target is built from data (for example a mapped list), the panel
  says "Orion can't change this one directly" and the describe box is offered. Orion
  never guesses.
- **Same element, rapid edits.** Edits are applied one at a time per Star; later ones
  queue.
- **Locked while building.** Edit mode is disabled with a short reason while the Star's
  status is working or needs you.
- **Preview down.** If the dev server stops, edit mode turns off and Preview in Canvas
  offers to restart.
- **Stale selection.** After any refresh the selection is resolved again from the page; if it
  can't be, it clears.
- **Look.** Existing panel styling only (flat, no offset shadows, Astryx tokens, no raw
  hex or px). No new visual language.

### If the source resolver stops working (a future Next/React change)

The panel shows "Orion can't find this element's code" and offers the describe box for
every element. Nothing is written. (Turbopack frames look different and are out of scope.)

## Delivery order

| Step | Work | Parallel with |
|------|------|---------------|
| 1 | Source resolver + element locator (spike already passed on Daily Quest) | — |
| 2a | Selection overlay (hover, select, report) | 2b, 2c |
| 2b | Property list + Edit panel with text and colour (web, inspector kit) | 2a, 2c |
| 2c | Edit helper: text and colour writes, safe-write checks, undo stack | 2a, 2b |
| 3 | Wire 2a → 2b → 2c end to end; pencil toggle in the preview header | — |
| 4 | Spacing, size, corners, resize handles | 5 |
| 5 | Describe box + `selection` attachment on build turns | 4 |
| 6 | Real-app acceptance on Daily Quest in Orion Staging | — |

## Testing

- **Unit:** property list (what applies to which element), each helper write (text,
  inline style, CSS rule, CSS module), safe-write refusals, undo/redo replay, typed-value
  validation, `not-found` and `not-literal` results.
- **Helper integration:** run edits against a copy of Daily Quest's source and check the
  exact file diff.
- **Overlay:** injected-script tests in a headless WebKit page.
- **Mac:** build and `swift test`; a UI check that edit mode is disabled while a build is
  running.
- **Acceptance (Step 6):** in Orion Staging, change Daily Quest's heading text and colour
  on the Canvas, see the preview update, undo it, then send one described change and see
  it arrive as a build turn with the screenshot attached.
- All repo checks stay green: `pnpm build`, `lint`, `typecheck`, `test:workspace`,
  `check:astryx`, `swift test`.

## Open risks, stated plainly

- The resolver depends on React 19 dev-mode `_debugStack` and Next's
  `/__nextjs_original-stack-frames` endpoint. Both are internal; the plan pins a test
  against Daily Quest's Next 15.5.0 so a future upgrade fails loudly.
- Values built from data (Daily Quest's greeting words, mapped lists) can't be edited
  directly; those go to the describe box. Daily Quest uses plain CSS (`globals.css`) and a CSS module (`page.module.css`), which version 1 handles.
- The Mac app's WebKit preview and the web board are separate surfaces; the selection
  has to cross the native bridge. If that proves laggy, the panel can move into the Mac
  app natively without changing the helper or the property list.
