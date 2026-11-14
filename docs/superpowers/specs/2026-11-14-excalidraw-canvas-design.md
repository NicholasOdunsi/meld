# Excalidraw-based multiplayer canvas

Supersedes `2026-11-11-project-canvas-rebuild-design.md` (build our own canvas engine). The native Swift app interface stays. The 11 Nov decisions to drop tldraw, keep generated-screen persistence, and migrate old boards still stand.

## In plain language

The canvas becomes a proper whiteboard where you and the AI work on the same board:

- You draw, sketch and arrange things with a real set of drawing tools.
- You draw a rough sketch, ask the AI to build it, and the result appears as a live HTML screen next to your sketch.
- You can move and resize that screen yourself, or tell the AI to change something specific in it.
- Several people can be on the same board at once and see each other's cursors and changes.
- The AI's screens can run scripts, so later they can behave like a working app, not only a picture.

We get the drawing tools and the sketch-to-HTML flow from Excalidraw (MIT licence, free for commercial use) instead of building them. We build the AI editing, multiplayer relay, saving, migration and the Mac app integration on top.

## Decisions made (2026-11-14)

1. **Base:** `@excalidraw/excalidraw` (MIT). Replaces both the tldraw canvas and the unfinished `canvas-next` prototype.
2. **Multiplayer:** wanted. Boards are shared and edited live.
3. **Scripts in generated pages stay enabled**, because the goal is prototypes that behave like real apps. This reverses the 11 Nov rule "generated scripts disabled". The consequences are in Security.

## What Excalidraw provides, verified in the published 0.18.1 package

- Whiteboard drawing, shapes, text, images, undo and redo, pan and zoom.
- A **Magic Frame** flow. You draw inside a frame and the editor calls `plugins.diagramToCode.generate({ frame, children, onPartial })`. The function we supply returns HTML, and the editor puts it in an `iframe` element beside the sketch. It streams partial HTML while generating. The package contains no model; we connect our own.
- `reconcileElements`, `updateScene`, `isCollaborating`, `onPointerUpdate` and a `collaborators` map for multiplayer clients. Each element carries a version number so edits merge per element.
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
- **Sketch to HTML:** Magic Frame calls our existing screen generator with a rendered image and structured geometry of the sketch. The result appears as a new frame to the right. Failed generation leaves the sketch untouched.
- **Edit by instruction:** select a frame and describe the change. The AI receives a screenshot, the current HTML, and any selected element, and returns a new revision. A new revision is created, not a silent overwrite, and if the page changed while the AI worked, the result appears separately for acceptance.
- **Direct edits stay narrow at first:** move, resize, delete, and replacing plain text inside a frame. Anything else goes through the AI. This follows the approach of Gui (Apache-2.0, `brijr/gui`), which keeps its in-place HTML editing to plain text and sends everything else to the agent.
- **The AI as a participant:** the AI writes to the board through the same relay as a person, so everyone sees a frame stream in.

### Multiplayer relay
- One Cloudflare Durable Object per board, replacing the tldraw logic inside the existing `CanvasRoom`. It holds the current scene and sends it to anyone who joins.
- Clients send only changed elements. The relay keeps the higher version. Cursors and presence are broadcast, never stored.
- Authentication reuses the signed short-lived canvas session already issued by the web app. Viewers are read-only.
- Merging is per element and the newest version wins. It is not a full conflict-free merge. A person moving a frame while the AI rewrites it is handled by keeping position on the board element and content in the screen record with its own revisions.
- Pasted images are stored outside the scene and referenced by identifier.

### Persistence
Scenes are saved as versioned JSON, independently of tldraw snapshots. Failed saves are visible and retryable, with a local recovery copy. Database changes need the separate schema review required on 11 Nov. This design does not authorise dropping or overwriting existing records.

## Security with scripts enabled

Enabling scripts widens what generated pages can do, so the following limits apply:

- **Isolated origin.** Frames never get same-origin access to the app, its cookies or its credentials. No access to native commands.
- **No navigation or popups.** Block top-level navigation, popups, form submission and downloads unless a feature deliberately needs one.
- **Network blocked by default.** Each page gets a content security policy that blocks outside requests and loading outside code. Images and fonts are inline.
- **Messages are checked.** Anything the page posts to the host is validated for source, frame identity and shape.

Excalidraw's built-in frame sandbox is looser (it enables popups, forms and downloads). The spike must find out whether this is configurable. If not, we render the frames ourselves or patch the package. We add our own content security policy to each page either way, and the spike confirms it works in both the browser and the Mac web view.

Two later consequences of "behaves like a real app":
- The generation contract changes. Today the generator prompt and schema force `script` to `null` and forbid JavaScript. That changes in the interactive-prototype stage, with the limits above kept.
- A page with no same-origin access cannot use `localStorage` or call our servers. Running prototypes with real state or data needs its own design (a storage shim, an allow-listed API), and is out of scope here.

## Spike (first stage, go or no-go)

Built behind a development route, touching no production boards, with a short report at the end. It must show:

1. Excalidraw mounted in the Next app with an Astryx-styled shell.
2. Our generator connected to Magic Frame, producing a live frame from a sketch.
3. Referenced-page rendering working, or the fallback chosen.
4. Frame sandbox settings: which can be changed, and the content security policy applied.
5. Two browser windows editing one board through a Durable Object relay, with cursors, joining late, and reconnecting.
6. Save, close and reopen.
7. About 20 live frames, with pan and zoom measured.
8. The board running in the Mac app's web view, including trackpad pan and pinch.

No-go triggers: frame sandbox not controllable, unacceptable performance with 20 frames, or relay merging unreliable.

## Delivery stages

1. Spike (above).
2. Production board: persistence, AI generation and instruction edits, revision handling.
3. Multiplayer hardening: roles, reconnection, offline buffering, load.
4. Migration of existing tldraw boards. The importer decodes saved records as data without running tldraw. Originals and unsupported records are kept and reported.
5. Integration and rollout behind a feature flag. Remove tldraw packages, its gateway code and the worker's tldraw room only after an import audit.
6. Interactive prototypes: script-enabled generation, the runtime and storage story.

Each stage gets its own plan after the previous one is reviewed.

## Out of scope here

Rebuilding project navigation or bot management, removing rooms from the product model, and offline-first editing.

## Acceptance criteria

1. A user draws a sketch, generates a live HTML frame from it, and reopens the saved result.
2. A user can ask the AI to change a selected frame and receives a new revision, and can undo it.
3. Two users on one board see each other's changes and cursors, and a user joining late sees the full board.
4. The board runs without tldraw.
5. Generated pages cannot reach the app's origin, credentials or network by default.
6. Existing boards survive migration, and unsupported content is reported.
7. Failed saves, stale revisions and failed generations preserve recoverable work.
