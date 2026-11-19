# Canvas powers

Status: draft for owner review, 2026-11-19
Builds on: `2026-11-14-excalidraw-canvas-design.md`, `2026-11-15-contextual-canvas-design.md`
Next project after this one: GitHub link (separate spec)

---

## Read this part first

The canvas stops being a drawing board with pictures on it. It becomes a place where you can point the chat at anything, bring screens to life, adjust them by hand and take the code away.

### What you will be able to do

1. **Use Orion's own toolbar.** Excalidraw's menus, side panels, library button and hint text disappear. A slim **side dock** runs down the left edge of the canvas with: Select, Hand, Frame, Pen, Shapes, Arrow, Text, Image, **Code** and Eraser. Zoom sits small in the bottom-right corner.
2. **Get a small pill next to anything you select.** It shows only what fits:
   - sketch or shape: stroke, colour, **Add to chat**
   - text: size, colour, **Add to chat**
   - screen: **Open live**, **Code**, **Add to chat**
3. **Point the chat at it.** **Add to chat** puts a chip in the chat box beside the canvas, like an attachment. Your next message goes to the AI with that selection.
   - A **sketch** becomes a new screen placed next to it.
   - A **screen** is changed where it is. The old version is kept, so **Restore previous** always works.
4. **Wake a screen up where it sits.** Double-click a screen, or press **Open live**, and it becomes a working app with a blue outline. Buttons work and you can type in it. Only one screen is live at a time. Click empty board or press Esc and it goes back to being a picture.
5. **Paste your own code.** The **Code** tool opens a paste box. Paste React (from Claude, ChatGPT, v0 and similar) or plain HTML, pick Phone, Tablet or Desktop, and it becomes a screen on the board. React, Tailwind styling and Lucide icons come built in. If the code needs something else, Orion names it instead of showing a blank screen.
6. **Tweak by hand.** While a screen is live, a panel on the right has two tabs.
   - **Tweak:** turn on **Pick**, click anything in the screen, and change its text, colours, font size and weight, spacing, corner roundness or size. The screen updates instantly and the code is rewritten to match. If something can't be changed by hand (for example, text the code builds from data), the panel says so and offers **Add to chat** for just that element. Undo and redo work.
   - **Code:** read and edit the code itself. The screen updates when you pause typing. **Copy** and **Download** (`.tsx` for React, `.html` for plain pages).

### Safety: one broken screen can't take the board down

Screens on the board are still pictures; they don't run any code. Only the one live screen runs code, and before it runs, Orion adds a safety check to every loop in it (the same approach the code playground CodePen uses). If the code gets stuck, Orion stops it and shows **"This screen stopped responding"** with a **Reload** button.

**Honest limit:** this catches endless loops, which is how screens usually freeze. It doesn't catch every possible way code can misbehave, such as one enormous calculation with no loop. If that ever happens, the canvas can freeze until the screen is closed. See *Risks*.

### Not in this project

- GitHub (the next project: connect a repo, bring real pages onto the canvas, push changes back)
- Several live screens at once
- Dragging elements around *inside* a screen
- Multiplayer
- Screens that fetch data from the internet (network stays blocked, as today)

The "Canvas is still loading. Try again." pop-up is a **separate quick fix**, not part of this project.

### Decisions made for you (flagged so you can overrule them)

| Decision | Why |
|---|---|
| Every screen, whether from AI, sketch or pasted, is saved as **code files with versions** in Orion's existing screen store, not inside the board drawing. | One place for every screen, real version history, and GitHub can plug in later without rework. Needs a database change, which gets its own review before it's applied. |
| The chat chip works in the **Mac app**. The web board keeps its current "Build screen" bar. | Orion is Mac-first, and the chat beside the canvas only exists in the Mac app. |
| The AI that changes a screen is **the one you've picked for that chat**, with DeepSeek as fallback (as Build screen works today). | Same behaviour you already know. |
| A live screen saves your tweaks as **one new version when it goes back to sleep**, or after 2 seconds without changes. It doesn't save one version per click. | Keeps **Restore previous** meaningful. Undo inside a session still goes step by step. |
| The button is called **Add to chat**. | The owner rejected "Ask". It's easy to rename. |

---

## Technical design (for implementers)

### Units

| Unit | Location | Purpose | Depends on |
|---|---|---|---|
| Screen source store | `supabase/migrations`, `apps/web/src/features/design/` | Versioned code files for every canvas screen | existing `design_screens` / `design_screen_versions` |
| Screen compiler | new `packages/screen-runtime` | Source files → one sandboxed document; loop guard; element tagging | Babel standalone, parse5 |
| Screen runtime | `packages/screen-runtime/runtime` | Vendored React, ReactDOM, lucide-react, clsx, Tailwind browser build; in-frame pick/stuck bridge | — |
| Source editor | `packages/screen-runtime/edit` | Apply a tweak (text, class, style) to source by element tag | compiler |
| Orion board chrome | `apps/web/src/features/canvas-excalidraw/chrome/` | Hide Excalidraw UI, side dock, selection pill, zoom | Excalidraw API, Astryx |
| Live screen host | `canvas-excalidraw/live/` | One live frame, Tweak/Code panel, stopped overlay | compiler, runtime, source editor, store |
| Paste code | `canvas-excalidraw/paste/` | Paste dialog, kind detection, unsupported-import report | compiler, store |
| Canvas selection to chat | web bridge + Mac `ChatComposer` + connector task | Chip, message context, sketch→screen and screen revise | store, existing build pipeline |

Each unit has a small public interface and its own tests; the compiler, runtime and source editor are pure and testable without a browser.

### 1. Screen source store

Add to `design_screen_versions`:

- `source_kind text not null default 'legacy' check (source_kind in ('legacy','html','react'))`
- `files jsonb` with shape `{ "<path>": "<content>" }`, size-capped (proposed 256 KB total, max 20 files), required when `source_kind <> 'legacy'`
- `entry text`, the file that renders (`App.tsx` or `index.html`)
- `form_factor text`, which is phone, tablet or desktop

Legacy rows keep `markup` / `styles` / `script`. New versions write `''` to `markup` and `styles`. Existing RLS policies on the table cover the new columns. **This migration must go through the separate schema review that the 11 Nov decision requires before it's applied.** No existing rows are rewritten.

Server actions (in `features/design`):

- `createCanvasScreen(roomId, { kind, files, entry, formFactor, name }) → { screenId, versionId }`
- `saveScreenVersion(screenId, baseVersionId, files) → saved | conflict | error`. The base is checked, matching the board's existing revision pattern.
- `listScreenVersions(screenId)` and `restoreScreenVersion(screenId, versionId)`. A restore creates a new version and never rewrites history.

Board link: embeddables keep `orion-screen://ds-<uuid>`. The board's `ScreenStore` becomes a **cache of the current version's sleeping document**. Older board-only screens (HTML stored in the board document) are converted into `html` design screens the first time they're opened live or edited, and their embeddable link is rewritten. Untouched ones stay as they are.

### 2. Screen compiler and runtime (`packages/screen-runtime`)

`compileScreen({ kind, files, entry }) → { ok: true, document } | { ok: false, errors[] }`

- **React:** Babel standalone, run in a Web Worker and loaded only when a screen goes live, compiles TSX/JSX with preset-react (automatic runtime) and preset-typescript. Imports are rewritten to a module map. Supported: `react`, `react-dom`, `react-dom/client`, `lucide-react`, `clsx`, and relative imports between the screen's own files. Anything else becomes a compile error listing the unsupported package names. If `entry` has a default export, it's mounted. Otherwise `App` is mounted.
- **HTML:** parse5 with source locations. Inline `<script>` bodies go through the same Babel pass (loop guard only). External `<script src>` and stylesheet links are reported as unsupported.
- **Loop guard:** a Babel plugin adds a check to every `for`, `while` and `do…while` loop. When one synchronous run exceeds 1 s, it throws `OrionStuckError`. The runtime catches it at the top level, through error and unhandled-rejection handlers, and posts `{type: "stuck"}`.
- **Element tags:** a Babel plugin (React) and a parse5 walk (HTML) add `data-orion-src="<file>:<start>:<end>"` to every element that comes from a literal JSX element or HTML tag. Tags are only added in live mode, and never appear in copied or downloaded code.
- **Document:** `<!doctype html>` + CSP meta (the existing `FRAME_CSP`, unchanged: no network) + inlined runtime bundle + compiled module + in-frame bridge. The runtime bundle is built at package build time and loaded as a static asset that the host inlines, so the frame never fetches anything.

**In-frame bridge** (`postMessage` to the parent, validated with zod in the style of `frame-bridge.ts`):

- `ready`
- `stuck`
- `error {message}`
- `goto {screenKey}` (kept from today)
- `hover {src, rect}` and `pick {src, text, isLiteralText, classes, computed: {color, background, fontSize, fontWeight, padding, gap, radius, width, height}}`, sent only while pick mode is on
- The parent sends `setPick(on)`

### 3. Source editor

`applyTweak(files, src, tweak) → { ok: true, files } | { ok: false, reason: "not-literal" | "not-found" }`

- **Text:** replaces a literal JSX text child or HTML text node at `src`. Expressions return `not-literal`.
- **Style:** if the element has a literal `className` / `class` containing Tailwind classes, swap the class for that property using a fixed mapping table: colour → `text-[#hex]`, background → `bg-[#hex]`, font size → `text-[Npx]`, weight → `font-*`, padding → `p-[Npx]`, gap → `gap-[Npx]`, radius → `rounded-[Npx]`, width and height → `w-[Npx]` / `h-[Npx]`. Otherwise, merge into a literal `style` object or attribute. A computed `className` or `style` returns `not-literal`.
- Pure function over source text plus positions. AST via Babel parser for TSX and parse5 for HTML.

### 4. Orion board chrome

- **Hiding Excalidraw's UI:** set `UIOptions` (`canvasActions` all `false`, `tools.image: false`). Pass `renderTopRightUI={() => null}`. A scoped stylesheet under `.orion-board` hides the main toolbar, top-left menu, hint viewer, bottom bar, library trigger and properties panel. `@excalidraw/excalidraw` stays pinned at `0.18.1`, and a browser test asserts those elements are hidden, so an upgrade that renames classes fails loudly.
- **Side dock:** Astryx components and tokens only (AGENTS.md rules, no raw `div`, no hex values). Vertical, left edge, vertically centred. Each tool calls `api.setActiveTool`. Shapes opens a small flyout (rectangle, ellipse, diamond). Code opens the paste dialog. Keyboard shortcuts stay Excalidraw's.
- **Selection pill:** placed under the selection bounds using `sceneCoordsToViewportCoords`, recalculated in `onChange` and on scroll or zoom. On a screen, **Code** wakes it and opens the panel on the Code tab. **Add to chat** shows only inside the Mac app (`isOrionFrameV2UserAgent`). Stroke, colour and text-size changes go through `updateScene` with `CaptureUpdateAction.IMMEDIATELY` so Excalidraw's undo covers them.
- **Zoom:** a small Astryx control in the bottom-right, using `api.updateScene({appState: {zoom}})`.
- **Flat rule:** no shadows. Depth comes from surface colour only.

### 5. Live screen host

- Board state holds `liveScreenId: string | null`. `FrameHost` renders the live document (`sandbox="allow-scripts"`, pointer events on) only for that ID. Every other screen keeps the scriptless `BOARD_FRAME_SANDBOX` thumbnail.
- **Waking a screen:** double-click on an embeddable, or **Open live** in the pill, compiles it in the worker. While that runs, the thumbnail shows a spinner state. On a compile error, the thumbnail stays and the panel opens on Code with the errors shown.
- **Going back to sleep:** Esc, clicking empty board, or selecting another screen. A pending draft is flushed as a new version (see below), and the thumbnail cache is refreshed.
- **Stuck:** on `stuck`, or `ready` not arriving within 5 s, the live frame is replaced by an Astryx overlay saying "This screen stopped responding" with **Reload** and **Show code**.
- **Tweak/Code panel:** a right-hand Astryx `LayoutPanel` over the board, about 280 px wide. Board panning stays available.
  - **Tweak** shows the picked element's fields. Each change calls `applyTweak`, then recompiles and reloads the frame. On `not-literal`, the fields are disabled and an **Add to chat** button for that element is shown.
  - **Code** uses a CodeMirror 6 editor with file tabs when there's more than one file. It recompiles 600 ms after you stop typing. On errors, it keeps the last good render and shows inline diagnostics. **Copy** writes the untagged source to the clipboard. **Download** saves a single file, or a `.zip` for several.
- **Draft and versions:** tweaks and code edits change an in-memory draft with an undo/redo stack. The draft is saved through `saveScreenVersion` after 2 s idle or on sleep. On conflict, the draft is kept and the owner is offered **Reload latest**.

### 6. Paste code

- Astryx `Dialog` with a large text area, form-factor choice (Phone, Tablet, Desktop) and name.
- **Kind detection:** `import`/`export` or JSX means `react`, a leading `<` with HTML tags means `html`, and anything else gets an inline error.
- Unsupported imports are listed in the dialog before creating anything.
- **Create:** `createCanvasScreen` adds an embeddable at the viewport centre at the device size, then opens the screen live.

### 7. Canvas selection to chat

- **Web → Mac:** **Add to chat** posts `canvas.attachSelection {roomId, selection}` through `postToNative`, where `selection` is one of:
  - `{kind: "sketch", frameId, label, thumbnail}`, which also covers loose shapes grouped by bounds
  - `{kind: "screen", screenId, versionId, label, thumbnail}`
  - `{kind: "element", screenId, versionId, src, label}`

  The thumbnail is a PNG data URL of at most 512 px from `exportToBlob`.
- **Mac:** `ChatComposer` holds one `canvasSelection` chip, labelled with the frame or screen name, with an ✕ to remove it. A new **Add to chat** replaces it. It only appears in the Canvas chat column (project or Star). The chip travels with the draft, so sending clears it.
- **Send:** the native bridge's `post` input gains an optional `canvasSelection`. `postMessage` stores it on the message (JSON metadata, displayed as a chip in the stream) and enqueues a **canvas edit task** instead of a plain Product Agent turn:
  - **sketch:** gather the sketch the way `collectSketch` does today, run `buildWithFallback` using the chat's chosen provider with the message as the instruction, and ask for React output. Create the screen with `createCanvasScreen` and place it to the right of the frame. The board gets a `canvas.placeScreen` command from Mac to web, carried by the existing focus command path.
  - **screen / element:** new connector prompt `canvas-screen-revise` with input `{files, entry, kind, instruction, src?}` and output `{files}` as JSON. Compile it before saving. A compile failure keeps the old version and posts the error as the AI's reply. Success goes through `saveScreenVersion`, and the reply includes **Restore previous**.
  - Fallback to DeepSeek follows the existing reasons in `screen-generator.ts`.
- The chat reply shows the screen card that already exists (`ScreenCard.swift`). Clicking it focuses that screen on the board.

### Error handling summary

| Situation | What the owner sees |
|---|---|
| Compile error while waking or pasting | Thumbnail stays; Code tab opens with errors |
| Unsupported package | Named in the paste dialog or the error list |
| Endless loop | "This screen stopped responding" with Reload / Show code |
| Tweak on computed value | Fields disabled; **Add to chat** for that element |
| Save conflict | Draft kept; **Reload latest** |
| AI returns broken code | Old version kept; AI reply says it failed and why |
| AI unavailable | DeepSeek fallback, as today; otherwise a clear chat reply |

### Testing

- **Unit (Vitest):**
  - compiler: React, HTML, unsupported import, the loop guard throws, tags are present in live builds and absent from exports
  - `applyTweak` for every field, plus `not-literal` cases
  - kind detection
  - bridge message parsing
  - pill contents per selection kind
  - store actions, including conflict and restore
- **pgTAP:** new columns, constraints and RLS for owner and non-member, using the scratch-DB recipe.
- **Playwright (dev board):**
  - Excalidraw UI hidden and dock tools work
  - paste React, open live, click a button, pick an element, change colour, check the code updated, copy
  - paste an endless-loop screen: stopped overlay shows and the board still pans
  - sleep creates a version and Restore previous works
- **Mac:**
  - `ChatComposer` chip state tests and bridge round-trip test
  - in Orion Preview: dock, pill, Add to chat on a sketch and on a screen, live screen with trackpad pan, Tweak/Code, Download

### Delivery order (subagent-driven)

Steps on the same line can run in parallel.

1. **Foundation:** (a) schema migration + store actions, held for schema review before it's applied · (b) `packages/screen-runtime` compiler, loop guard, tags, runtime bundle · (c) board chrome: hide Excalidraw UI, dock, pill, zoom.
2. **Live and paste:** live screen host and stuck overlay · paste dialog. Needs 1a–1c.
3. **Hand editing:** source editor + Tweak tab · Code tab. Both need 2.
4. **Chat:** Mac chip + bridge · connector `canvas-screen-revise` prompt + canvas edit task. Needs 1a, and can run alongside 2–3.
5. **Verification:** full Playwright run, Mac preview walkthrough, screenshots for the owner.

### Risks

- **Freeze outside loops:** the loop guard doesn't stop one long synchronous call or deep recursion with no loop. In WebKit, a sandboxed `srcdoc` frame shares the board's process. The proper fix is a separate process, such as a native `WKWebView` overlay per live screen on Mac. Deferred unless the owner hits it in practice.
- **Excalidraw upgrades:** hiding its UI depends on class names. The version pin plus the browser test catch this.
- **Tailwind arbitrary values:** tweaks write values like `text-[#5151FC]`, which work but aren't the cleanest class names. A later pass can snap to the project's design tokens.
- **Babel standalone size** (several MB): loaded lazily in a worker only when a screen goes live, then cached.
