# Excalidraw-based canvas

Supersedes `2026-11-11-project-canvas-rebuild-design.md` (build our own canvas engine). The native Swift app interface stays. The 11 Nov decisions to drop tldraw, keep generated-screen persistence, and migrate old boards still stand.

## In plain language

The canvas becomes a proper whiteboard where you and the AI work on the same board:

- You draw, sketch and arrange things with a real set of drawing tools.
- You draw a rough sketch, ask the AI to build it, and the result appears as a live HTML screen next to your sketch.
- You can move and resize that screen yourself, or tell the AI to change something specific in it.
- Later, several people will be able to share a board and see each other's cursors and changes. That is deferred for now (see Decisions).
- The AI's screens can run scripts, so later they can behave like a working app, not only a picture.

We get the drawing tools and the sketch-to-HTML flow from Excalidraw (MIT licence, free for commercial use) instead of building them. We build the AI editing, saving, migration and the Mac app integration on top. Multiplayer comes later.

## Decisions made (2026-11-14)

1. **Base:** `@excalidraw/excalidraw` (MIT). Replaces both the tldraw canvas and the unfinished `canvas-next` prototype.
2. **Multiplayer: deferred (2026-11-14).** It stays wanted, but is left out of the spike and the first releases. The design below keeps it possible; the ready-made plan is `docs/superpowers/plans/2026-11-14-excalidraw-multiplayer-relay.md`. Until it ships, a board has one active editor.
3. **Scripts in generated pages stay enabled**, because the goal is prototypes that behave like real apps. This reverses the 11 Nov rule "generated scripts disabled". The consequences are in Security.
4. **Whose AI builds the screens (2026-11-14):** the owner's own connected AI first, through the existing generation queue. DeepSeek is the fallback when no AI is connected, the connected AI is at its usage limit or needs a fresh sign-in, or it fails or times out.

## What Excalidraw provides, verified in the published 0.18.1 package

- Whiteboard drawing, shapes, text, images, undo and redo, pan and zoom.
- A **Magic Frame** flow. You draw inside a frame and the editor calls `plugins.diagramToCode.generate({ frame, children, onPartial })`. The function we supply returns HTML, and the editor puts it in an `iframe` element beside the sketch. It streams partial HTML while generating. The package contains no model; we connect our own.
- `reconcileElements`, `updateScene`, `isCollaborating`, `onPointerUpdate` and a `collaborators` map, which a later multiplayer layer can use. Each element carries a version number so edits merge per element.
- Export to image or SVG, and the element list as structured data, for sending a selection to the AI.

It does not provide a sync server, editing inside the generated HTML, or the AI connection. Those are ours.

## Architecture

### Board
One Excalidraw scene per board, stored as JSON in the database under the board's existing identifier. Excalidraw's hand-drawn style is turned down so the board looks polished. Application controls around the board use Astryx components and tokens (see AGENTS.md). Camera and selection are local view state.

### HTML frames
A frame is an Excalidraw object with a position and size. Its page is a generated screen with revisions.

Preferred model: the scene holds only a screen identifier, and the HTML stays in the existing screen records, so moving a frame never re-sends a large page. The spike must show Excalidraw can render a referenced page. **Fallback if it cannot:** keep the HTML in the element's `customData`, and send HTML only when the page itself changes, never when the frame moves.

Frames are shown live. Interacting with a frame's contents is an explicit mode (Excalidraw's hover then click-to-activate), so board gestures do not compete with the page's own input.

### AI integration
- **Sketch to HTML:** the selected sketch frame goes to the owner's own connected AI (Claude Code, Codex, or whatever they connected) through the existing generation queue, as a structured sketch layout plus their instruction. The result appears as a new frame to the right, and the board says which AI built it. **DeepSeek is the fallback** when no AI is connected, the connected AI has reached its usage limit or needs a fresh sign-in, or it fails or takes too long; the board says why it stepped in. Failed generation leaves the sketch untouched.
- **Edit by instruction:** select a frame and describe the change. The AI receives a screenshot, the current HTML, and any selected element, and returns a new revision. A new revision is created, not a silent overwrite, and if the page changed while the AI worked, the result appears separately for acceptance.
- **Direct edits stay narrow at first:** move, resize, delete, and replacing plain text inside a frame. Anything else goes through the AI. This follows the approach of Gui (Apache-2.0, `brijr/gui`), which keeps its in-place HTML editing to plain text and sends everything else to the agent.
- **The AI as a participant:** the AI writes to the board like a person, so its frames appear as it builds them. When multiplayer ships, it writes through the same relay as everyone else.

### Multiplayer relay (deferred)
Not built in the spike or the first releases. Kept here so the rest of the design stays compatible with it.

- One Cloudflare Durable Object per board, replacing the tldraw logic inside the existing `CanvasRoom`. It holds the current scene and sends it to anyone who joins.
- Clients send only changed elements. The relay keeps the higher version. Cursors and presence are broadcast, never stored.
- Authentication reuses the signed short-lived canvas session already issued by the web app. Viewers are read-only.
- Merging is per element and the newest version wins. It is not a full conflict-free merge. A person moving a frame while the AI rewrites it is handled by keeping position on the board element and content in the screen record with its own revisions.
- Pasted images are stored outside the scene and referenced by identifier.

### Persistence
Scenes are saved as versioned JSON, independently of tldraw snapshots. Until multiplayer ships, a board has one active editor: a second tab or person sees a "being edited elsewhere" notice, and stale saves are rejected by an explicit revision check. The spike itself saves only in the browser's local storage. Failed saves are visible and retryable, with a local recovery copy. Database changes need the separate schema review required on 11 Nov. This design does not authorise dropping or overwriting existing records.

## Security with scripts enabled

Enabling scripts widens what generated pages can do, so the following limits apply:

- **Isolated origin.** Frames never get same-origin access to the app, its cookies or its credentials. No access to native commands.
- **No new windows, window takeover, real form posts or downloads** from a frame, unless a feature deliberately needs one. In-page menus, modals and dropdowns are ordinary page content and work. Scripts handle form clicks without a real submit.
- **Screen-to-screen links go through the canvas.** A button in one screen posts a message naming the target screen (screens already have stable names); the canvas validates it and swaps that frame to the target screen or moves focus to the next frame. New screens are generated from the same style context so they match the current one.
- **External links open only after a click, in the system browser**, through the canvas and not from the page.
- **Network blocked by default.** Each page gets a content security policy that blocks outside requests and loading outside code. Images and fonts are inline. A later per-board setting may allow named outside services for prototypes that need real data.
- **Messages are checked.** Anything the page posts to the host is validated for source, frame identity and shape.
- **Native bridge not exposed.** WebKit can make native message handlers available inside iframes, so generated frames must not be able to call the Mac app's native commands. Verified in the spike.
- **Hostile or buggy scripts.** A runaway script can freeze the board. A collaborator's board runs their scripts in your browser, so isolation protects people from each other, not only from our own AI.

Excalidraw's built-in frame sandbox is looser (it enables popups, forms and downloads). The spike must find out whether this is configurable. If not, we render the frames ourselves or patch the package. We add our own content security policy to each page either way, and the spike confirms it works in both the browser and the Mac web view.

Two later consequences of "behaves like a real app":
- The generation contract changes. Today the generator prompt and schema force `script` to `null` and forbid JavaScript. That changes in the interactive-prototype stage, with the limits above kept.
- A page with no same-origin access cannot use `localStorage` or call our servers. Running prototypes with real state or data needs its own design (a storage shim, an allow-listed API), and is out of scope here.

## Spike (first stage, go or no-go)

Built behind a development route, touching no production boards, with a short report at the end. It must show:

1. Excalidraw mounted in the Next app with an Astryx-styled shell.
2. A live frame built from a sketch, using a normal Excalidraw frame as the sketch region and our own "Build screen" action (Magic Frame's built-in generate path hardcodes a looser sandbox). The owner's connected AI builds it through the existing queue; DeepSeek (a direct server call) steps in when there is no connection, a limit, a sign-in problem, a failure or a timeout. Pages built through the queue have no scripts or `data-goto` links yet; the script-enabled generation contract is stage 6.
3. Referenced-page rendering working, or the fallback chosen.
4. Frame sandbox settings: which can be changed, the content security policy applied, a page's message to switch screens working, and a page in the Mac web view proven unable to call native commands. Also how a script that loops forever affects the board.
5. Save, close and reopen (browser storage only).
6. About 20 live frames, with pan and zoom measured.
7. The board running in the Mac app's web view, including trackpad pan and pinch.

Deferred: two browser windows editing one board through a Durable Object relay, with cursors, late joining and reconnecting.

No-go triggers: frame sandbox not controllable, or unacceptable performance with 20 frames (p95 frame time above 50 ms).

## Delivery stages

1. Spike (above).
2. Production board: persistence, AI generation and instruction edits, revision handling.
3. Multiplayer (when wanted): the relay, cursors, roles, reconnection, offline buffering, load. Ready-made plan: `2026-11-14-excalidraw-multiplayer-relay.md`.
4. Migration of existing tldraw boards. The importer decodes saved records as data without running tldraw. Originals and unsupported records are kept and reported.
5. Integration and rollout behind a feature flag. Remove tldraw packages, its gateway code and the worker's tldraw room only after an import audit.
6. Interactive prototypes: script-enabled generation, the runtime and storage story.

Each stage gets its own plan after the previous one is reviewed.

## Out of scope here

Multiplayer for now, rebuilding project navigation or bot management, removing rooms from the product model, and offline-first editing.

## Acceptance criteria

1. A user draws a sketch, generates a live HTML frame from it, and reopens the saved result.
2. A user can ask the AI to change a selected frame and receives a new revision, and can undo it.
3. A second tab or person opening a board that is being edited sees a clear notice, and a stale save is rejected without losing work. (Live co-editing is deferred.)
4. The board runs without tldraw.
5. Generated pages cannot reach the app's origin, credentials or network by default.
6. Existing boards survive migration, and unsupported content is reported.
7. Failed saves, stale revisions and failed generations preserve recoverable work.
