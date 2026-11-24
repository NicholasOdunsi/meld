# Canvas live edit — change a running app by pointing at it — design

Date: 2026-11-24 · Status: awaiting owner review · Branch: `NicholasOdunsi/canvas-live-edit`

## Read this part first (plain language)

Today, **Preview in Canvas** shows a Build Star's running app (for example Daily Quest)
inside the Star's frame on the Canvas board. You can look at it and click around, but
nothing you do there changes the code. Generated HTML screens feel different because the
screen *is* the code, so Orion can rewrite it. This spec gives real apps the same feel.

**What you'll do:**

1. Open **Preview in Canvas** on a finished Build Star. A new **Edit** tool appears in the
   Canvas toolbar. Turn it on.
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

**What decides whether this works — the first thing we build is a test of it:**
React 19 no longer records which file and line an element came from. Orion therefore has
to tag every element with its file and line while the preview runs. We prove this on
Daily Quest before anything else ("Step 1" below). If it can't be done cleanly, the
fallback is defined below, so we never ship a guess.

## How it works (for the builders)

```
Preview (WKWebView in the Mac app)   Canvas board (web)            Mac app
  selection overlay (injected JS) →  Edit panel (inspector kit)  →  Edit helper (JS file
  hover / click / double-click       shows the right controls        bundled in the app)
        ↑ refresh (dev server reloads)                                   ↓
        └──────────────────── files in the build's working copy ←────────┘
```

### Pieces, one purpose each

1. **Source tagging.** While a preview runs, every JSX element gets
   `data-orion-src="<relative path>:<line>:<column>"`. Done by a build-time transform
   added only for the preview process, written to a file that is excluded from Git
   (`.git/info/exclude`) so the repo is never polluted. *Interface:* given a worktree,
   `startPreview` returns a running server whose HTML carries the tags.
2. **Selection overlay.** A script injected into the preview's WebKit view
   (`WKUserScript`). Highlights on hover, selects on click, reports
   `{src tag, tag name, text, computed style subset, bounding box}` to the Mac app, and
   supports double-click text editing and resize handles. It never navigates or submits
   anything. (The preview is a native overlay, so this lives in the Mac app, not the web
   board.)
3. **Edit panel.** A new web panel in the Canvas board
   (`apps/web/src/features/canvas-excalidraw/chrome/element-panel.tsx`) built from the
   existing inspector kit (`LayoutPanel`, `Section`, `FieldRow`, `ColourRow`,
   `NumberField`, `SelectField`, `PanelCloseButton`). Selection arrives from the Mac app
   over the existing native bridge; edits go back the same way.
4. **Property list.** `element-properties.ts` declares each editable property once:
   `{ id, label, appliesTo(element), control: "colour" | "number" | "text" | "select",
   range, write(change) }`. The panel renders whatever list applies to the selection.
   Adding a property later means adding one entry, with no new panel code. (This is the
   "each parameter names its own control" idea from Toolcraft; we borrow the idea, not
   the package, which generates standalone apps.)
5. **Edit helper.** One JavaScript file bundled inside the Mac app and run with the same
   Node runtime the preview already uses. It parses the file named by the tag and
   changes only the targeted value: a literal text child, an inline style, or a CSS
   rule or module the element's class points to. It reports success with the new file
   contents, or `not_found` / `ambiguous`. It was chosen over the connector because the
   Mac app ships automatically while connector distribution is still blocked, and
   because it needs no cloud round trip, so edits are instant and work offline.
6. **Undo stack.** The Mac app keeps before/after contents of each edited file, per Star,
   in a private folder. Undo and Redo replay them. This is separate from Git on purpose
   (decision change from the earlier chat idea of one Git commit per edit: dozens of
   nudge commits would pollute the build's branch).
7. **Describe path.** The box sends a normal build turn to the Star with an attachment
   block: the element's tag, text, styles, a cropped screenshot of the selection and its
   page position. Reuses the existing queue, approvals and failure messages. Needs one
   small contract addition (an optional `selection` object on the build turn).

### Rules and edge cases

- **Safe writes.** The helper only touches files inside the Star's recorded working copy
  (the same check `BuildPreview.worktree(for:)` already does), refuses paths with `..`
  or symlinks out, and only accepts typed values: colours must be valid CSS colours,
  numbers are clamped to the property's range, text is length-limited.
- **Not found / ambiguous.** If the tag is missing, the line no longer matches (the
  file changed), or the target is built from data (for example a mapped list), the panel
  says "Orion can't change this one directly" and the describe box is offered. Orion
  never guesses.
- **Same element, rapid edits.** Edits are applied one at a time per Star; later ones
  queue.
- **Locked while building.** Edit mode is disabled with a short reason while the Star's
  status is working or needs you.
- **Preview down.** If the dev server stops, edit mode turns off and Preview in Canvas
  offers to restart.
- **Stale selection.** After any refresh the selection is re-resolved by its tag; if it
  can't be, it clears.
- **Look.** Existing panel styling only (flat, no offset shadows, Astryx tokens, no raw
  hex or px). No new visual language.

### If tagging can't be done cleanly (fallback, decided now)

Version 1 then supports only: literal text edits and class-based colour/size edits where
the element's text or class is unique in the project's source. Everything else goes to
the describe box. The panel and helper stay the same; only the tag source changes.

## Delivery order

| Step | Work | Parallel with |
|------|------|---------------|
| 1 | **Spike:** tag elements in Daily Quest's preview, no repo changes; decide between "tagging" and "fallback" | — |
| 2a | Selection overlay (hover, select, report) | 2b, 2c |
| 2b | Property list + Edit panel with text and colour (web, inspector kit) | 2a, 2c |
| 2c | Edit helper: text and colour writes, safe-write checks, undo stack | 2a, 2b |
| 3 | Wire 2a → 2b → 2c end to end; Edit tool in the toolbar | — |
| 4 | Spacing, size, corners, resize handles | 5 |
| 5 | Describe box + `selection` attachment on build turns | 4 |
| 6 | Real-app acceptance on Daily Quest in Orion Staging | — |

## Testing

- **Unit:** property list (what applies to which element), each helper write (text,
  inline style, CSS rule, CSS module), safe-write refusals, undo/redo replay, typed-value
  validation, `ambiguous` and `not_found` results.
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

- Step 1 may show tagging needs a temporary config file in the working copy; we keep it
  out of Git, but a project with an unusual Next.js setup may refuse it, which triggers
  the fallback.
- CSS written as utility classes (Tailwind) or built from data can't be edited
  directly in version 1; those go to the describe box. Daily Quest uses plain CSS (`globals.css`) and a CSS module (`page.module.css`), which version 1 handles.
- The Mac app's WebKit preview and the web board are separate surfaces; the selection
  has to cross the native bridge. If that proves laggy, the panel can move into the Mac
  app natively without changing the helper or the property list.
