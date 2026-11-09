# Native Inspiration screen (Orion Mac app)

Status: approved in brainstorm 2026-11-09 · Owner: Nicholas Odunsi
Builds on: `2026-11-06-inspiration-library-and-shelf-design.md` (library + Shelf),
`2026-11-07-inspiration-auto-sorting-design.md` (AI descriptions),
`2026-11-08-orion-mac-app-design.md` (Mac app, "go native screen by screen").
Comes before: the native Taste screen (its own spec).
Mockups: `.superpowers/brainstorm/71764-1794253751/content/final-design.html`.

---

## Part A — Read this first (plain language)

### Why

In the Mac app, Inspiration is still the web page shown inside the native frame.
It works, but it doesn't feel like a Mac app: scrolling, dragging and
right-clicking all behave like a website. This build rebuilds the Inspiration
screen in SwiftUI. **It is a straight port of what exists today, made native**,
plus one small upgrade: you can now see what Orion's AI noticed about each image.

### What you'll be able to do

- Click **Inspiration** in the sidebar and see all your saved images as a
  **Pinterest-style wall**. Every image keeps its real shape, so nothing is
  cropped. Newest images come first.
- Make the tiles bigger or smaller with a slider or **⌘+ / ⌘−**. Orion
  remembers the size you pick.
- **Drag images onto the wall** or press **⌘V** to save them.
- **Click an image** and a side panel slides in from the right. It shows your
  note, which you can edit, then **What Orion noticed** (the AI's description),
  the source link, the date, and the chats that use the image.
- Use the **arrow keys** to move between images, and **spacebar** for a big
  Quick Look. Close the panel with **Esc**, **✕**, or by clicking the image again.
- **⌘-click or Shift-click** to pick several images. A glass bar then shows
  **Delete** and **Add to Chat…**.
- **Right-click** any image for Add to Chat…, Copy Image, Open Source Link and
  Delete. Drag any image out to Finder, Figma or Slack.
- Keep seeing your wall when you're offline, from the last time it loaded.

### Decisions from the brainstorm (and why)

| Decision | Why |
|---|---|
| Straight port, no new features except the AI description | The fastest way to a real Mac feel. Upgrades are easier once the screen is native. |
| Side panel that appears only when you click an image | You keep your place in the collection while looking at one image. It's the familiar Mac layout (like Finder's info pane). |
| Pinterest wall (masonry), nothing cropped | Saves are a mix of tall phone screens and wide web pages, and the whole design matters. It's also how Pinterest looks. |
| Panel shows your note first, the AI's description below it | Your words stay the main thing, and you can see what the AI thinks the image is. The description already exists, so it costs nothing extra. |
| The Mac app uses the **Shelf's private key** to load and change images | Fast, works as soon as the app opens, and doesn't depend on the hidden web page. **This widens what that key can do**: before, it could only upload images and read chat names. Now it can also list, edit notes on, delete, and add-to-chat your inspiration images. It still can't read messages, PRDs or canvases. |

### Not in this build

Search, filters, collections, editing the AI's description, the Taste screen
(still the web page; it gets its own native spec next), and any change to the
web version of Inspiration (it keeps working in a browser).

---

## Part B — Exact behaviour

### B1. Opening

- The sidebar's **Inspiration** row opens the native screen in the detail
  column instead of loading `/{workspace}/inspiration`. The web view stays
  loaded behind it, so going back to a chat is instant.
- **Taste** (`/{workspace}/inspiration?tab=taste`) still opens the web page.
- If the web page navigates to `/{workspace}/inspiration` by itself (for
  example from a link), the frame shows the native screen.

### B2. The wall

- Items are `ready` inspiration images, newest first. `pending` items (just
  uploaded) show as a tile with a faint shimmer. `failed` items are not shown.
- Masonry columns. The number of columns comes from the window width ÷ the
  tile width. Tile width is set by the slider (5 steps, about 140–360 pt).
  **⌘+** and **⌘−** move one step. The step is saved in UserDefaults.
- The layout uses each item's stored `width`/`height`, so tiles have their
  final size before the pictures load. Nothing jumps.
- A tile shows only the image, with rounded corners. On hover it lifts
  slightly, and the selection gets an Orion-blue outline.
- Only on-screen tiles load images (a lazy grid).
- Header: the title "Inspiration" and the size slider. No item count.
- Empty state: "Drag images here, paste with ⌘V, or use the Shelf in your
  menu bar."

### B3. Side panel

- It appears only when exactly one image is selected by a plain click, and
  slides in from the right (about 300 pt wide). The wall reflows to the
  remaining width.
- The panel shows, top to bottom:
  1. ✕ button
  2. The image (whole, fit to width)
  3. **Your note**: an editable multi-line field. It saves 1 s after you stop
     typing, and when the panel closes. Empty is allowed.
  4. **What Orion noticed**: the AI description in secondary text. If there is
     no label yet: "Orion is still looking at this…". If sorting failed or the
     image was skipped, the section is hidden.
  5. **From**: the source URL as a link, opened in the default browser. Hidden
     if there is none.
  6. **Saved**: a relative date ("Today, 14:02"; "3 Nov").
  7. **Used in**: chips showing "Chat · Project" for each chat that uses the
     image. Clicking a chip opens that chat. Hidden if the image isn't used.
- Keys: **← → ↑ ↓** move the selection through the wall and the panel follows.
  **Space** opens Quick Look for the full-size image. **Esc**, **✕**, or
  clicking the selected image again closes the panel.

### B4. Picking several

- **⌘-click** toggles an image in or out of the selection. **Shift-click**
  selects a range. **⌘A** selects all. Esc clears the selection.
- With 2 or more images selected, the panel closes and a glass bar appears at
  the bottom of the wall: "N selected", **Delete** (secondary), and
  **Add to Chat…** (Orion blue).
- **Add to Chat…** opens an `OrionDialog` titled "Add to Chat". It lists chats
  grouped by project (single choice), with an **Add** action. On success, the
  selection clears and a short confirmation appears ("Added 3 images to
  Main · Voxecore").
- **Delete** opens the destructive `OrionDialog`: "Delete 3 images?" / "They'll
  be removed from Inspiration and from any chats using them. This can't be
  undone." The Delete button is red and has no Return shortcut.

### B5. Right-click menu (one image, or the current selection)

Add to Chat…, Copy Image (one image only), Open Source Link (one image with a
source only), Delete…

### B6. Adding images

- Dropping image files, or image data from another app, anywhere on the wall
  saves them. So does **⌘V** while the wall has focus.
- Images go through the Shelf's existing save path: shrink if needed, queue,
  upload, and queue offline if the connection is down. A pending tile appears
  at the top straight away.
- Non-images are ignored, and a short message says "Only images can be saved
  to Inspiration."

### B7. Dragging out

Dragging a tile out gives the full-size image as a file (PNG/JPEG/WebP, as
stored), named `inspiration-<short id>.<ext>`.

### B8. Freshness

The wall reloads when Inspiration opens, when the Orion window becomes active
again, and right after the Shelf finishes an upload. There is no background
polling.

### B9. Offline and errors

- The last successful list is cached on disk with its downsampled
  thumbnails. Offline, the wall shows the cache under a one-line banner:
  "Offline — showing your last saved view." Edit, delete and add-to-chat are
  disabled while offline. Drops and pastes still queue.
- When a save fails (note, delete, add to chat), the Orion error dialog shows
  a plain sentence about what didn't happen, and the UI goes back to its
  previous state. A failed note save keeps the typed text in the field.
- A tile whose image fails to load shows a grey tile with a ↻ button.
- If the server returns `unauthorized` (the key was revoked), the app
  re-runs Shelf auto-connect once. If that fails, it shows "Reconnect
  Inspiration" with a button that starts the existing connect flow.
- If the Shelf isn't connected yet, the screen shows "Connecting…" and
  triggers auto-connect.

---

## Part C — Technical design

### C1. Server: new Shelf endpoints (`apps/web/src/app/api/shelf/`)

They are all authenticated with `authenticateShelfRequest` (bearer Shelf
token → `{userId, workspaceId}`), use `createShelfServerClient()`, and return
errors with `shelfError(...)`, like the existing `items`/`rooms` routes. Every
query is filtered by the principal's `workspaceId`, and it checks the user is
still a member, the same way `list_capture_rooms` does with `actor_user_id`.
Business logic is shared with the web feature
(`inspiration-reader.ts`, `inspiration-repository.ts`,
`inspiration-actions.ts`). Route files stay thin.

| Route | Method | Body / query | Returns |
|---|---|---|---|
| `/api/shelf/library` | GET | `?cursor=&limit=` (default 200) | `{ items: [{ id, status, width, height, mimeType, note, sourceUrl, createdAt, description \| null, labelState: "pending"\|"done"\|"skipped", rooms: [{ roomId, roomName, projectName }], imageUrl, imageUrlExpiresAt }], nextCursor }` |
| `/api/shelf/library/{id}` | PATCH | `{ note: string \| null }` (max 2,000 characters; the web action has no limit today, so this endpoint sets one) | the updated item |
| `/api/shelf/library/delete` | POST | `{ ids: uuid[] }` (1–100) | `{ deleted: number }` |
| `/api/shelf/library/add-to-room` | POST | `{ ids: uuid[], roomId: uuid }` | `{ added: number }` |

- `imageUrl` is a signed Storage URL (1 h), the same kind the web reader
  creates. There are no server thumbnails, because image transforms are a paid
  Supabase feature.
- `description` comes from `inspiration_labels`. `labelState` maps the label
  `status` as follows: `sorted` → `done`, `unsorted` or no label row → `pending`,
  `unsortable` → `skipped`. The panel shows the text for `done`, "still looking"
  for `pending`, and nothing for `skipped`.
- Contracts (request/response zod schemas plus TS types) go in
  `@meld/contracts`, next to `ShelfRoom`.
- The existing `/api/shelf/rooms` already returns `project_name`, so it serves
  the Add to Chat dialog unchanged.
- The rate limit reuses `shelf-rate-limit.ts`.

### C2. Mac: data layer (`apps/mac/Sources/ShelfCore/Library/`, tested)

- `OrionClient` gains `library(cursor:token:)`, `updateNote`, `delete(ids:)`
  and `addToRoom(ids:roomID:)`, using the existing typed-throws
  `ShelfAPIError`, and `URLSessionOrionClient` implements them. Fakes are
  updated.
- `LibraryStore` (`@Observable`, `@MainActor`) holds the items, selection,
  load state (`loading/loaded/offline/needsConnect`), and optimistic edits that
  roll back on failure. It saves `library.json` under
  `Application Support/Orion/inspiration-cache/`.
- `ThumbnailCache` downloads once, downsamples to the largest tile size ×
  screen scale with ImageIO, and stores the result on disk keyed by item id.
  Full-size images are fetched on demand for Quick Look, copy and drag-out.
- `MasonryLayout` is a pure function: (items' aspect ratios, available width,
  tile width, spacing) → column count plus frames. It is unit tested.

### C3. Mac: screen (`apps/mac/Sources/Orion/Inspiration/`)

- `InspirationScreen`: the wall (a custom `Layout` or column `LazyVStack`s
  driven by `MasonryLayout`), header, glass selection bar, and empty, offline
  and connect states.
- `InspirationTile`, `InspirationPanel`, `AddToChatDialog` (built on
  `OrionDialog`). Delete uses `OrionDialog(isDestructive: true)`.
- Drop and paste go through the existing Shelf `Outbox`/`Uploader`. Drag-out
  uses `Transferable` / `onDrag` with a file representation. Quick Look uses
  `quickLookPreview`.
- **Frame wiring:** `FrameDestination.inspiration` makes `OrionFrameView` show
  `InspirationScreen` over the web content, with the web view still in the
  hierarchy and hidden. `.taste` still loads the web page. Opening a chat from
  a "Used in" chip uses the existing `frame.openTab` / navigate path.
- Follow `.claude/skills/swiftui-pro`, the `OrionDesignSystem` tokens and
  colours (Orion blue `dayBreakBlue`, red `loudRed`), and the `OrionDialog`
  added in the 2026-11-09 New/Edit Project work.

### C4. Testing

- **Web (vitest):** a route test file per endpoint, covering an unauthorized
  token, the wrong workspace, a revoked membership, validation errors, and
  the happy path (with labels present, pending, or skipped). Contract schema
  tests.
- **Mac (swift test):** `LibraryStore` (load, paging, cache fallback when
  offline, optimistic note/delete/add with rollback, unauthorized →
  reconnect), `ThumbnailCache` (downsample size, disk hit), `MasonryLayout`
  (column count across widths, shortest-column placement, stable order), and
  `URLSessionOrionClient` request shapes via `StubURLProtocol`.
- **Manual acceptance in Orion Preview** (demo data), with screenshots in
  `.context/`: browse and resize; open the panel; edit a note; arrow keys;
  Quick Look; multi-select; Add to Chat; Delete; drag in; ⌘V; drag out to
  Finder; offline banner (stop the local site); empty state.
- The demo/fake backend (`inspiration-fake.ts`) must serve the new endpoints
  so the preview works without Supabase.

### C5. Risks

- **Signed URLs expire after 1 h.** The store refreshes them on reload, and a
  failed thumbnail fetch triggers one list reload before showing ↻.
- **Widening the Shelf key's scope** (this is a decision, so it's recorded
  here). The key stays workspace-scoped, hashed at rest, and revocable from
  web Settings → Shelf.
- **Large libraries:** the list is paged (200). The wall fetches the next page
  when it scrolls near the end.
