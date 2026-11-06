# Inspiration Library + Mac Shelf (Orion, Step 1)

Status: approved in brainstorm 2026-11-06 · Owner: Nicholas Odunsi
Follow-up: Step 2 "Taste Profile + AI eyes" gets its own spec. Do not build any of it here.

---

## Part A — Read this first (plain language)

### Why this exists

Orion (the new name for Meld, now a personal tool for one person) should be
the one place where an idea goes from research to a built product. Right now
the owner leaves Orion to collect visual inspiration on Pinterest and other
sites, and those images end up scattered across apps.

Step 1 brings inspiration *into* Orion:

1. **The Shelf** is a small Orion icon in the Mac menu bar. Drag any image onto
   it, or copy an image and press a shortcut, and it gets saved. It works from
   any app: Safari, Chrome, Figma, Finder, screenshots.
2. **The Inspiration Library** is a new page in Orion that shows every saved
   image as a grid. From there, images can be added to any room.

In Step 2, Orion's AI will learn the owner's visual taste from this library
and use the images a room has picked when it designs screens. That is the
reason the library exists. Step 1 only collects and organizes the images.

### What the owner will be able to do when Step 1 is done

- Drag an image onto the menu-bar icon and see a ✓.
- Copy an image anywhere, press **⌥⌘O**, and see a ✓.
- Click the icon to get a panel with a drop zone, ⌘V paste, the last few saved
  images, an optional note, and an optional "also add to room…" picker.
- Lose nothing when Orion isn't running. Images wait on the Mac and send later,
  and the icon shows how many are waiting.
- Open **Inspiration** in Orion's sidebar and see everything as a grid, newest
  first. Click an image to see it large with its note, source link, date, and
  the rooms that use it. Edit the note or delete the image.
- Drag or paste images straight onto the Inspiration page.
- Select images and choose **Add to room…**. The room then gets an
  **Inspiration** tab showing them.

### Decisions made in the brainstorm (and why)

| Decision | Why |
|---|---|
| Orion is a single-person tool | It's the owner's personal workspace. Team features are not extended. |
| Mac menu-bar shelf, not a browser extension | It works in every app, including Safari, screenshots, and Figma. |
| Built and installed only on the owner's Mac | No Apple developer account ($99/yr) is needed when nobody else installs it. |
| One personal library; adding to a room is optional | Saving stays fast with no decisions to make, and one image can serve many rooms. It also has to be one library for Step 2's taste learning. |
| No tags or folders | The owner didn't choose organizing. Not needed yet. |
| Two-step plan (Library + Shelf first, Taste second) | Step 1 is useful on its own and easier to test. |

### Two small changes from what was said in the chat

1. **Size limit.** In the chat I said 20 MB. Orion's server already caps
   uploads at about 11 MB, so the limit is **10 MB**. To make up for it, the
   shelf and the web page **automatically shrink** big images before sending.
   In practice you should never see a "too large" message.
2. **What the shelf's key is allowed to do.** In the chat I said it could
   "only add images." To show the "add to room…" picker it also needs to
   **read your room names**. It can see the names and nothing else: no
   messages, PRDs, or canvases.

### What is *not* in Step 1

The Taste Profile, the AI looking at images, tags or folders, video, a browser
extension, getting images from phones, sharing with other people, and
publishing the Mac app. GIFs are saved as a still image (their first frame).

---

## Part B — Product behavior (exact)

### B1. Shelf

| Action | Result |
|---|---|
| Drag one or more images onto the menu-bar icon | Each image is queued, then uploaded. The icon flashes ✓ once for the whole drop. |
| Press ⌥⌘O while the clipboard holds an image | The image is queued and uploaded, and the icon flashes ✓. |
| Press ⌥⌘O with no image on the clipboard | The icon shakes and a 2-second tooltip reads "No image on the clipboard." |
| Click the icon | The panel opens (see below). |
| Drag in or paste something that isn't an image | The panel or icon shakes, with the text "Only images for now." |
| The image is bigger than 10 MB, or its longest side is over 4096 px | Shrink it to a longest side of 4096 px and re-encode as JPEG quality 0.85. If it is still over 10 MB, shrink to 2048 px. If it is *still* too large, reject it with "Too large to save." |
| HEIC/HEIF | Convert to JPEG (quality 0.9) before queueing. |
| GIF | Take the first frame and encode it as PNG. |
| TIFF/BMP (for example from Preview) | Encode as PNG. |
| Drop or paste from a browser that supplies a URL | Store that URL as `sourceUrl`. Otherwise `sourceUrl` is null. |

**Panel contents, top to bottom:** a drop zone (it also accepts ⌘V while
the panel is focused); a one-line note field (applies to the *next* save, then
clears); a room picker (default **"Library only"**; the list shows
`Project › Room` names and is refreshed each time the panel opens); a
"Waiting: N" line, shown only when N > 0, with a **Retry now** button; the
last 6 saved thumbnails (click one to open it in Orion); a footer with
**Open Library**, **Settings…**, and **Quit**.

**Icon states:** normal · ✓ flash (about 1 s) · a badge with the waiting count
· a warning glyph when disconnected (clicking it opens the Connect screen).

**Connect screen** (shown on first run or when disconnected): the Orion base
URL field (default `http://127.0.0.1:3000`), a code field, and a **Connect**
button. Errors appear inline. On success it shows "Connected to <workspace
name>."

**Launch at login:** on by default after the first successful connect. It can
be turned off in Settings….

### B2. Connecting the shelf (web)

New page: **Settings → Shelf** (`/[workspaceId]/settings/shelf`).

- If no shelf is connected, show **Connect shelf**. Clicking it shows a
  one-time code (same alphabet and format as the device pairing codes) that is
  valid for 10 minutes, with a countdown and copy button.
- If a shelf is connected, show a row with the device name, when it connected,
  when it was last used, and a **Disconnect** button. Disconnecting revokes the
  token immediately, and the shelf's next request gets 401.
- Only one active shelf token per user per workspace. Connecting again revokes
  the previous token.

### B3. Inspiration Library (web)

- **Sidebar:** a new **Inspiration** item between "Home" and "Design System",
  linking to `/[workspaceId]/inspiration`.
- **Page:** a header ("Inspiration", plus a count), then a grid of tiles
  (newest first, loaded 60 at a time with "Load more"). The page itself is a
  drop and paste target. Uploading tiles show the Thumbnail shimmer.
- **Empty state:** "Nothing here yet. Drag images onto the Orion icon in
  your menu bar, or drop them here."
- **Tile:** the image (cropped to fill a square tile). On hover, a checkbox
  (top-left) and a note indicator if a note exists. Click opens the detail view.
- **Detail view:** a large Astryx `Dialog` with the image on the left and a
  details column on the right: the editable note, a source link (opens in a
  new tab), the saved date, a list of rooms using it (each a link), and a
  **Delete** button with a confirm dialog. Prev and next buttons move through
  the grid. Clicking the image opens the Astryx `Lightbox` for full-screen
  zoom. (Lightbox captions must be plain text, so the editable details can't
  live inside it.)
- **Selection:** when 1 or more tiles are checked, a bar appears with "N
  selected", **Add to room…**, **Delete**, and **Clear**.
  - *Add to room…* opens a dialog with a searchable list of rooms grouped by
    project. Confirming adds the images, and a toast reads "Added N images to
    <Room>."
  - *Delete* opens a confirm dialog ("Delete N images? They'll also be removed
    from any rooms using them."), then deletes them.
- **Freshness:** the page re-fetches its first page whenever the browser tab
  regains focus. That's how images saved from the shelf show up. There is no
  realtime channel.
- **Web uploads** accept PNG, JPEG, WebP, and GIF (first frame drawn to a
  canvas and saved as PNG). HEIC shows "Drop HEIC photos on the menu-bar
  shelf instead." Large images are shrunk in the browser with the same 4096 →
  2048 rule as the shelf.

### B4. Room Inspiration tab

- New room surface `inspiration`, labeled **Inspiration**. It appears once a
  room has 1 or more linked images, following the same "emerges when it has
  content" rule as the other tabs.
- It shows the same grid tile component, limited to the room's images, in the
  order they were added (newest first).
- Actions: **Add from library** (opens a picker dialog of library tiles with
  checkboxes) and, per tile or per selection, **Remove from room**. This
  removes only the link. The image stays in the Library.
- Clicking a tile opens the same detail view.

### B5. Duplicates and deletion rules

- An image's identity is the SHA-256 of the **final uploaded bytes**, per
  workspace. Saving the same bytes again:
  - does **not** create a second item;
  - **does** update the note when a new non-empty note was supplied;
  - **does** add the room link when a room was chosen (adding a room that is
    already linked is a no-op);
  - returns the existing item with `duplicate: true`. The shelf still shows ✓.
- Deleting an image deletes its room links and its storage object.
- Deleting a room deletes its links only (cascade). Images stay.

---

## Part C — Architecture

```
 ┌──────────── Mac ─────────────┐        ┌──────────── Orion web (Next.js) ───────────┐
 │ Orion Shelf.app (Swift)      │  HTTPS │ /api/shelf/connect      (code → token)     │
 │  capture → normalize → outbox│ ─────► │ /api/shelf/rooms        (names only)       │
 │  uploader (retry/backoff)    │ Bearer │ /api/shelf/items        (multipart upload) │
 │  Keychain: capture token     │ token  │            │                               │
 └──────────────────────────────┘        │            ▼ service-role client           │
                                         │ features/inspiration/* ── RPCs ──► Postgres│
 Browser (signed-in owner) ─ server ───► │   (same service functions, user session)   │
                            actions      │                         └──► Storage bucket│
                                         └─────────────────────────────────────────────┘
```

- **One write path.** Shelf uploads and web uploads both end in the same
  feature function `saveInspirationItem(...)`. It runs "create intent →
  upload object → finalize", the same shape as
  `features/rooms/upload-persistence.ts`. The only difference between the two
  callers is who they are: a capture token (service-role client plus an
  explicit `user_id`) or a browser session (an RLS-scoped client using
  `auth.uid()`).
- **No gateway changes.** The gateway and connector are not involved.
- **No AI.** Nothing in Step 1 creates `ai_tasks`.

---

## Part D — Data model (Supabase)

One forward migration: `supabase/migrations/20261106000001_inspiration.sql`.
Never edit existing migrations.

```sql
-- Library items: one row per unique image per workspace.
create table public.inspiration_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  storage_path text not null unique,           -- '<workspace_id>/<id>.<ext>'
  mime_type text not null
    check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  source_url text check (source_url is null or char_length(source_url) <= 2048),
  note text check (note is null or char_length(note) <= 500),
  capture_channel text not null check (capture_channel in ('shelf', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, content_hash)
);
create index inspiration_items_workspace_created
  on public.inspiration_items (workspace_id, created_at desc);

-- Room links (no image copies).
create table public.room_inspiration (
  room_id uuid not null references public.rooms(id) on delete cascade,
  item_id uuid not null references public.inspiration_items(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, item_id)
);
create index room_inspiration_item on public.room_inspiration (item_id);

-- Shelf connection codes + tokens (modelled on device_pairing_codes;
-- deliberately NOT reusing execution_devices, which is tied to ai_provider).
create table public.capture_connect_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.capture_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  device_name text not null check (char_length(device_name) between 1 and 100),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index capture_tokens_one_active
  on public.capture_tokens (user_id, workspace_id) where revoked_at is null;
```

**Storage:** a private bucket `inspiration`, with `file_size_limit` of 10 MB and
`allowed_mime_types` limited to png, jpeg, and webp. Object path:
`<workspace_id>/<item_id>.<png|jpg|webp>`. Storage policies:
`select` and `insert` for `authenticated` when the first path segment is a
workspace where `is_workspace_member` is true. This is used by web uploads,
which run in a server action with the user's session. Shelf uploads use the
service-role client. Deletes always go through the server after
`delete_inspiration_items` returns the paths (session client for web, with a
matching `delete` policy). Mirror the `discovery-attachments` policies in
`202607240004_discovery.sql`.

**RLS:**
- `inspiration_items` and `room_inspiration`: `select` for
  `is_workspace_member(workspace_id)` (for links, check through the item's
  workspace). No direct insert, update, or delete grants. All writes go through
  RPCs.
- `capture_connect_codes` and `capture_tokens`: no grants to `anon` or
  `authenticated` beyond the owner `select` on `capture_tokens` that the
  Settings page needs (`user_id = auth.uid()`). Never expose `token_hash` to
  the client. Select explicit columns.

**RPCs.** All are `security definer`, `set search_path = ''`, and copy the
`add_design_reference` pattern exactly: `revoke all … from public, anon,
authenticated, service_role`, then grant only the role that should call it.

| Function | Caller | Purpose |
|---|---|---|
| `create_inspiration_intent(workspace_id, hash, mime, size, w, h, source_url, note, channel)` | authenticated | Returns the existing ready row (with `duplicate=true`, after applying the note rule) or inserts a `pending` row. Checks `is_workspace_member`. |
| `finalize_inspiration_item(item_id)` / `fail_inspiration_item(item_id)` | authenticated | Pending → ready or failed. Only the creator. |
| `capture_inspiration_intent(user_id, workspace_id, …same…)` plus `capture_finalize…` / `capture_fail…` | service_role | The same logic for shelf uploads. Re-checks that `user_id` is still a member of `workspace_id`. |
| `update_inspiration_note(item_id, note)` | authenticated | Member check. |
| `delete_inspiration_items(item_ids uuid[])` | authenticated | Returns the deleted `storage_path`s so the caller removes the objects. Max 100 ids. |
| `link_inspiration_to_room(room_id, item_ids uuid[])` / `unlink_inspiration_from_room(room_id, item_ids uuid[])` | authenticated | `can_edit_room(room_id)`, and every item must be in the room's workspace. Idempotent. Max 100 ids. |
| `capture_link_inspiration_to_room(user_id, room_id, item_id)` | service_role | Shelf "also add to room". Same checks, done on behalf of `user_id`. |
| `create_capture_connect_code(workspace_id, code_hash, expires_at)` | authenticated | Member check. Max 5 unredeemed live codes per user. |
| `redeem_capture_connect_code(code_hash, token_hash, device_name)` | service_role | Single-use and not expired. Revokes the prior active token and inserts the new one. Returns `{workspace_id, workspace_name}`. |
| `resolve_capture_token(token_hash)` | service_role | Returns `{token_id, user_id, workspace_id}` when the token is active and the user is still a member. Bumps `last_used_at` (at most once per minute). |
| `revoke_capture_token(token_id)` | authenticated | Owner only. |
| `list_capture_rooms(user_id, workspace_id)` | service_role | Returns `[{room_id, room_name, project_name}]` for rooms the user can edit. **Names only.** |

Before writing SQL, read `supabase/migrations/202608130009_design_references_handoffs.sql`
and `202607280002_device_pairing.sql`. Match their style (explicit `errcode`,
`not_authorized` messages, grant blocks). Then run `pnpm check:sql-arities` and
`pnpm check:sql-rooms`.

---

## Part E — Contracts and HTTP API

### E1. Contracts (`packages/contracts/src/inspiration.ts` + export from `index.ts`)

Zod schemas, which are the single source of truth for both the web app and
the shelf's JSON:

- `InspirationItemViewSchema`: `{ id, workspaceId, imageUrl (signed, 1h), width, height, mimeType, sourceUrl|null, note|null, captureChannel, createdAt, roomIds: uuid[] }`
- `ShelfConnectRequestSchema`: `{ code: string, deviceName: string(1..100) }` → `ShelfConnectResponseSchema`: `{ token: string, workspaceId, workspaceName }`
- `ShelfRoomSchema`: `{ roomId, roomName, projectName }`
- `ShelfUploadResponseSchema`: `{ itemId, duplicate: boolean, roomLinked: boolean }`
- `ShelfErrorSchema`: `{ error: { code: 'unauthorized'|'invalid_code'|'rate_limited'|'unsupported_type'|'too_large'|'invalid_image'|'unavailable', message: string } }`

Limits live in one exported constant object `INSPIRATION_LIMITS = { maxBytes: 10_485_760, maxEdge: 4096, noteMax: 500, sourceUrlMax: 2048, pageSize: 60, bulkMax: 100 }`.
Do not repeat these numbers anywhere else in TypeScript. The Swift app keeps
its own copy in `Limits.swift`, with a comment pointing to this file.

### E2. Token format

Use `packages/device-auth`: `hashToken` and `verifyToken` are reused as they
are. Add `mintCaptureToken()` → `{ token: "orion_cap_" + base64url(32 random bytes), tokenHash }`
and `parseCaptureAuthorization(header)` (expects `Bearer orion_cap_…`), with
tests beside them in `capture-tokens.ts`/`capture-tokens.test.ts`. Connect
codes reuse `mintPairingCode` / `normalizePairingCode`.

### E3. Routes (`apps/web/src/app/api/shelf/…/route.ts`)

| Route | Auth | Behavior |
|---|---|---|
| `POST /api/shelf/connect` | none (code) | Rate-limited with a **new** `shelf-rate-limit.ts` that copies `pair-rate-limit.ts` (failures per IP: 10 per 10 min). Valid code → `201 ShelfConnectResponse`. Any failure → `400 invalid_code` (never reveal *why*). |
| `GET /api/shelf/rooms` | Bearer capture token | `200 ShelfRoom[]` |
| `POST /api/shelf/items` | Bearer capture token | `multipart/form-data`: `file` (required), `note?`, `sourceUrl?`, `roomId?`. Returns `201` for a new item, `200` for a duplicate, and `ShelfUploadResponse` in both cases. Errors: 401 unauthorized · 413 too_large · 415 unsupported_type · 422 invalid_image · 503 unavailable. **A room problem never fails the upload.** If `roomId` is missing, deleted, or not allowed, the image is still saved and the response says `roomLinked: false`. |

Rules for every route:
- Validate input with the contract schemas. Unknown fields are ignored.
- **Never trust client metadata.** The server sniffs magic bytes (PNG `89 50 4E 47`, JPEG `FF D8 FF`, WebP `RIFF....WEBP`), reads the dimensions itself, and computes the SHA-256 itself. Use the `image-size` npm package (exact pin) for dimensions. Reject anything over 4096 px per side or over 10 MB.
- `sourceUrl` must parse as `http:` or `https:`. Otherwise drop it silently.
- Error bodies use `ShelfErrorSchema`. Log the error code only. Never log tokens, codes, image bytes, notes, or URLs.
- The service-role client comes from a new `lib/supabase/shelf-server.ts` that copies `device-pairing-server.ts` and reads `MELD_SHELF_SERVICE_ROLE_KEY`. Add it to `.env.example` and the README env table.

---

## Part F — Code structure

### F1. Web (`apps/web/src`)

```
features/inspiration/
  inspiration-shared.ts        # bucket id, TTL, row zod schema, toItemView() pure mapper (no "use server")
  inspiration-shared.test.ts
  image-validation.ts          # sniffMime(), readDimensions(), sha256Hex(): pure, server-only
  image-validation.test.ts
  save-inspiration-item.ts     # the ONE write path: intent → upload → finalize/fail; takes a repo+storage port
  save-inspiration-item.test.ts
  inspiration-repository.ts    # thin RPC wrappers (session client + service client variants)
  inspiration-repository.test.ts
  inspiration-reader.ts        # "use server": listLibrary(page), listRoomInspiration(roomId), getItem(id)
  inspiration-reader.test.ts
  inspiration-actions.ts       # "use server": uploadFromWeb, updateNote, deleteItems, linkToRoom, unlinkFromRoom
  inspiration-actions.test.ts
  shelf-connection.ts          # "use server": createConnectCode, listShelfTokens, revokeShelfToken
  shelf-connection.test.ts
  shelf-rate-limit.ts          # copy of features/ai/pair-rate-limit.ts semantics
  shelf-rate-limit.test.ts
  client-image-prep.ts         # browser: GIF→PNG first frame, downscale 4096→2048, reject HEIC
  client-image-prep.test.ts
  use-library-refresh-on-focus.ts (+ .test.tsx)
  components/
    inspiration-library-view.tsx (+ .test.tsx)   # page body: header, grid, drop/paste, selection bar
    inspiration-tile.tsx (+ .test.tsx)
    inspiration-detail.tsx (+ .test.tsx)          # Dialog: image + details column; image → Lightbox zoom
    add-to-room-dialog.tsx (+ .test.tsx)
    library-picker-dialog.tsx (+ .test.tsx)       # used by the room tab's "Add from library"
    room-inspiration-surface.tsx (+ .test.tsx)
    shelf-settings-view.tsx (+ .test.tsx)

app/(app)/[workspaceId]/inspiration/page.tsx       # server component → reader → <InspirationLibraryView/>
app/(app)/[workspaceId]/settings/shelf/page.tsx
app/api/shelf/connect/route.ts (+ .test.ts)
app/api/shelf/rooms/route.ts (+ .test.ts)
app/api/shelf/items/route.ts (+ .test.ts)
lib/supabase/shelf-server.ts (+ .test.ts)
```

Edits to existing files (keep each one minimal):
- `ui/workspace-navigation.tsx`: add the Inspiration `SideNavItem` (choose a pixel icon from `ui/pixel-icons.tsx`; if none fits, add one in the same `pixelIcon(` style).
- `features/rooms/surfaces.ts` + `room-tabs.ts`: add `"inspiration"` to `RoomSurface`, `hasInspiration: boolean` to `RoomSurfaceState`, and the label. Update `surfaces.test.ts` for the new emergence rule. The surface goes **after** `prototype` and **before** `overview`. It counts toward the `artifacts.length >= 2` overview rule.
- The room page loader that builds `RoomSurfaceState`: compute `hasInspiration` with a `count` query on `room_inspiration`.
- `packages/contracts/src/index.ts`: export the new module.
- `packages/device-auth/src/index.ts`: export the capture-token helpers.

### F2. Shelf app (`apps/shelf`, Swift 6.4, macOS 26+, Xcode 27)

The structure follows the project's **`swiftui-pro` skill** (`.claude/skills/swiftui-pro/`,
vendored from twostraws/SwiftUI-Agent-Skill @ `f2920b6`, MIT). In short:
**one type per file, folders grouped by feature, all logic in testable
models outside the views.**

```
apps/shelf/
  Package.swift                       # SwiftPM, swift-tools 6.x, Swift 6 language mode, platforms: .macOS(.v26)
                                      #   targets: OrionShelf (executable) → ShelfCore (library); ShelfCoreTests; OrionShelfTests
  README.md                           # plain steps: build, install, connect, uninstall
  scripts/build-app.sh                # swift build -c release → "Orion Shelf.app" (Info.plist, LSUIElement=YES)
                                      #   → codesign --force -s - → copy to ~/Applications
  Resources/Info.plist
  Resources/Localizable.xcstrings     # every user-facing string (English only for now)

  Sources/OrionShelf/                 # the app: SwiftUI views + the minimum AppKit glue
    App/
      OrionShelfApp.swift             # @main SwiftUI App; Settings scene; @NSApplicationDelegateAdaptor
      AppDelegate.swift               # creates the StatusItemController + GlobalHotkey; owns AppModel via @State in App
      AppModel.swift                  # @MainActor @Observable: wires ShelfCore services together; injected via .environment
    StatusItem/
      StatusItemController.swift      # NSStatusItem + popover hosting PanelView (AppKit — see "Why AppKit" below)
      StatusItemDropView.swift        # NSView drag destination on the status button → AppModel.capture(...)
      StatusIcon.swift                # enum: idle, success, waiting(Int), disconnected, rejectedShake
    Panel/
      PanelView.swift                 # composes the subviews below; no logic
      DropZoneView.swift              # dropDestination(for:) + paste handling
      NoteFieldView.swift
      RoomPickerView.swift            # Picker over [ShelfRoom], "Library only" default
      WaitingRowView.swift            # "Waiting: N" + Retry now
      RecentThumbnailsView.swift      # LazyHGrid of the last 6
      RecentThumbnailView.swift       # one tile; Button that opens the item in Orion
      PanelFooterView.swift           # Open Library · Settings… · Quit
      PanelModel.swift                # @MainActor @Observable: note text, selected room, room loading, actions
    Connect/
      ConnectView.swift
      ConnectModel.swift              # @MainActor @Observable: base URL, code, submit(), inline error
    Settings/
      SettingsView.swift              # launch at login toggle, base URL, Disconnect, Open outbox folder
      SettingsModel.swift
    Hotkey/
      GlobalHotkey.swift              # ⌥⌘O via Carbon RegisterEventHotKey; calls AppModel.captureClipboard()
    Design/
      ShelfDesign.swift               # enum of shared constants: spacing, corner radius, icon sizes, animation durations

  Sources/ShelfCore/                  # ALL logic. No SwiftUI. AppKit only for NSPasteboard/NSImage reading.
    Limits.swift                      # mirror of INSPIRATION_LIMITS (comment links packages/contracts/src/inspiration.ts)
    Capture/
      CapturedImage.swift             # struct: data, typeIdentifier, sourceURL?
      PasteboardReader.swift          # NSPasteboard → [CapturedImage]
      ImageNormalizer.swift           # ImageIO: HEIC→JPEG, GIF→PNG first frame, TIFF/BMP→PNG, downscale 4096→2048
      NormalizedImage.swift           # struct: data, mimeType, width, height
      NormalizationError.swift        # enum: notAnImage, tooLarge, decodeFailed
    Outbox/
      Outbox.swift                    # actor; ~/Library/Application Support/Orion/shelf-outbox/; atomic writes
      OutboxEntry.swift               # struct (Codable, Identifiable): id, fileName, mimeType, note?, sourceURL?, roomID?, createdAt
    Upload/
      Uploader.swift                  # actor; drains the outbox serially; stops on 401
      BackoffSchedule.swift           # pure: 2s, 4s, 8s … capped at 5 min
      UploadOutcome.swift             # enum: uploaded(ShelfUploadResponse), rejected(reason), unauthorized, retryLater
    Network/
      OrionClient.swift               # protocol OrionClient: connect, rooms, upload
      URLSessionOrionClient.swift     # the real one (async URLSession)
      MultipartFormBody.swift
      ShelfRoom.swift / ShelfUploadResponse.swift / ShelfConnectResponse.swift / ShelfAPIError.swift
    Auth/
      TokenStore.swift                # protocol
      KeychainTokenStore.swift        # generic password, service "com.orion.shelf", account = base URL
    State/
      ConnectionState.swift           # enum: disconnected, connected(workspaceName)

  Tests/ShelfCoreTests/               # swift-testing (`import Testing`, `@Test`, `#expect`)
    one test file per ShelfCore type, e.g. ImageNormalizerTests.swift, OutboxTests.swift, UploaderTests.swift,
    BackoffScheduleTests.swift, URLSessionOrionClientTests.swift (URLProtocol stub), MultipartFormBodyTests.swift,
    PasteboardReaderTests.swift (named NSPasteboard), Fixtures/ (tiny png, jpg, webp, heic, gif, tiff, oversize jpg)
  Tests/OrionShelfTests/
    PanelModelTests.swift, ConnectModelTests.swift, SettingsModelTests.swift   # models tested with fake OrionClient/TokenStore
```

- **Why AppKit at all.** SwiftUI's `MenuBarExtra` can't accept a drag onto the menu-bar icon itself, and drag-onto-the-icon is the main feature. So `StatusItem/` (three files) and `Hotkey/` use AppKit/Carbon. **Nothing else may import AppKit UI.** All panels and windows are SwiftUI.
- **No third-party Swift packages.** SwiftUI, AppKit (status item only), ImageIO, UniformTypeIdentifiers, Security, ServiceManagement, and Carbon (hotkey only).
- **Launch at login:** `SMAppService.mainApp.register()` after the first connect. If registration fails (for example because of the ad-hoc signature), show "Couldn't turn on launch at login. Add Orion Shelf in System Settings → General → Login Items." Never crash.
- **Outbox semantics:** write the image and metadata atomically *before* any network call. Delete the files only after a 200/201 response. A 413/415/422 response moves the entry to `outbox/rejected/` and shows the reason once. A 401 stops the uploader and enters the disconnected state while keeping the entries. Network errors and 5xx retry using `BackoffSchedule`.
- **Base URL:** `@AppStorage("baseURL")` in views and `UserDefaults` in models (never `@AppStorage` inside an `@Observable` class). Default `http://127.0.0.1:3000`. The token goes **only** in the Keychain.
- Not part of the pnpm/turbo graph (no `package.json` in `apps/shelf`). Add `apps/shelf/.build/` to the root `.gitignore`. CI is unchanged in Step 1. `swift test` is run locally.

---

## Part G — Development rules (mandatory for whoever builds this)

These rules exist to keep the codebase clean. A task is not done until every
rule below holds.

### G1. Before writing code
1. Read `AGENTS.md`, this spec, and the files this spec says to copy from. **Copy existing patterns. Don't invent new ones.** If you think a pattern is wrong, stop and ask. Don't quietly do something different.
2. Before using a UI component, run `pnpm exec astryx component <Name>`. Use `Grid`, `Lightbox`, `Thumbnail`, `EmptyState`, `Toast`, `CheckboxInput`, `Dialog`, and `SideNavItem` from `@astryxdesign/core`. Don't hand-roll a modal, toast, grid, or lightbox.
3. Check `git log -5` and `git status`. Work on a feature branch, never `main`.

### G2. Writing code
- **TDD.** Write the failing test, watch it fail, then write the code. Every new `.ts/.tsx` module gets a test beside it with the same name (`pnpm test:colocation` enforces this).
- **One write path.** Web uploads and shelf uploads both call `saveInspirationItem`. Any second insert path is a bug.
- **Limits come from `INSPIRATION_LIMITS`** (or `Limits.swift`). Magic numbers fail review.
- **UI rules (enforced by `pnpm check:astryx`):** no raw `<div>`/`<span>` layout, no `.css` files or CSS modules for this feature, no hex colors, no px values. Use component props first, then `var(--spacing-*)`, `var(--color-*)`, and `var(--radius-*)` tokens. **Flat look:** no drop shadows. Depth comes from color only.
- **Errors the owner sees** are short, specific, and human ("Too large to save."). Never show a stack trace, a Postgres code, or "Something went wrong" without saying what.
- **Security:** never log or return tokens, codes, token hashes, image bytes, notes, or source URLs. Select explicit columns, never `*`, on token tables. Use `timingSafeEqual` (`verifyToken`) for token comparison.
- **No speculative code.** Don't add tags, folders, AI hooks, realtime, "future" flags, unused parameters, or commented-out code. Step 2 will add what it needs.
- **Comments** explain *why*, not *what*. No banner comments, no "// TODO" without an issue link, no restating the code.
- **Names** follow the existing style: kebab-case files, `useX` hooks, `XView` page bodies, `*-reader.ts` for reads, `*-actions.ts` for mutations, `*-shared.ts` for pure shared helpers.
- **Small files.** If a component passes ~250 lines, split it along a real boundary (for example, tile vs. selection bar), not arbitrarily.
- **Dependencies:** the only new npm dependency allowed is `image-size`, pinned exactly (no `^`). No new Swift packages.
- **Swift:** follow G2b below.

### G2b. Swift rules (the shelf)

**Load the `swiftui-pro` skill before writing or reviewing any Swift.** Its
rules are binding. The iOS-only parts (iPhone Duo, tab bars, toolbars,
`UIScreen`, launch screens) don't apply to a menu-bar Mac app; everything
else does. The rules that matter most here:

- **Structure:** one type per file. Folders by feature (as in F2). No views built from computed `some View` properties or functions; extract a `View` struct in its own file instead. Keep `body` short.
- **Logic out of views:** button actions are methods (`Button("Retry now", systemImage: "arrow.clockwise", action: model.retry)`), not inline closures full of logic. Business logic never lives in `body`, `task()`, or `onAppear()`. It lives in `@Observable` models or ShelfCore, where it's unit-tested.
- **State:** `@Observable` classes are `@MainActor`. Own them with `@State private`; pass them with `@Environment` or `@Bindable`. No `ObservableObject`, `@Published`, `@StateObject`, or `@EnvironmentObject`. Every `@State` is `private` and initialized in one place.
- **Concurrency:** Swift 6 strict concurrency, zero warnings. `actor` for `Outbox` and `Uploader`. `async`/`await` everywhere: **no GCD** (`DispatchQueue`), no completion-handler APIs when an async version exists, `Task.sleep(for:)` not `nanoseconds`, no `Task.detached` without a written reason. Use `task()` (not `onAppear`) for async work started by a view.
- **Safety:** no force unwraps or `try!` outside tests. Errors from user actions are always shown to the owner, never just `print`ed or swallowed.
- **Modern API:** `foregroundStyle` (not `foregroundColor`), `clipShape(.rect(cornerRadius:))`, the two-parameter or zero-parameter `onChange`, `.animation(_:value:)` only, `Date.now`, `URL.applicationSupportDirectory.appending(path:)`, `if let x {` shorthand, `Double` over `CGFloat` unless an API needs `CGFloat`, `@ContentBuilder` for new view builders, `#Preview` for previews, and `ContentUnavailableView` for empty and disconnected states.
- **Design:** every spacing, radius, size, and duration comes from `ShelfDesign`. No literal numbers in views. Use system fonts and hierarchical styles (`.secondary`), `bold()` instead of `fontWeight(.bold)`, and `Label` instead of an icon+text `HStack`. Flat look to match Orion: no shadows.
- **Accessibility:** every icon button has a text label (`Button("Open Library", systemImage: …)`, `.labelStyle(.iconOnly)` when it should look icon-only). The status item and thumbnails get `accessibilityLabel`s. The ✓ flash and the shake become an opacity change when `accessibilityReduceMotion` is on. No `onTapGesture` for things that are buttons.
- **Strings:** all user-facing text lives in `Localizable.xcstrings`. Types that carry UI text use `LocalizedStringResource`. Outside SwiftUI, use `String(localized:)`. Never build `Text` with `+`.
- **Secrets:** the capture token goes in the Keychain only. Never in `@AppStorage`/`UserDefaults`, logs, or the outbox JSON.
- **Tests:** swift-testing for all of ShelfCore and every `*Model`. Inject protocols (`OrionClient`, `TokenStore`) so tests never hit the network or the real Keychain.
- **Review:** before claiming a Swift task is done, run a `swiftui-pro` review over the changed files and fix every finding (or write down why it doesn't apply).

### G3. Database
- Forward migrations only. Run them with `supabase migration up --local`, **never** `supabase db reset` on the shared dev DB (it wipes data). Check `which supabase` points at 2.109.1 first.
- Every RPC gets a pgTAP file `supabase/tests/inspiration.test.sql` and `capture_tokens.test.sql` covering: a member succeeds, a non-member is rejected, anon is rejected, a duplicate hash returns the existing row and the note rule holds, link/unlink is idempotent, a cross-workspace room is rejected, a revoked token doesn't resolve, an expired or redeemed code fails, and reconnecting revokes the old token.
- Run pgTAP on a scratch DB, not the shared dev DB (see the project's scratch-DB recipe in `.context/SETUP-NOTES.md` if present).

### G4. Before claiming a task is done
Run all of these and paste the real output into the task report:
```
pnpm test            # includes astryx, colocation, sql checks, workspace tests
pnpm typecheck
pnpm lint
pnpm check:astryx
cd apps/shelf && swift build && swift test     # when shelf code changed; must print zero warnings
# + a swiftui-pro review of changed Swift files, findings fixed
```
No "should work." If something can't be run, say so and why.

---

## Part H — Testing plan

**Unit (web, vitest):**
- `image-validation`: real tiny PNG, JPEG, and WebP fixtures; a renamed `.txt` posing as PNG gets rejected; dimensions read correctly; an oversize edge gets rejected.
- `save-inspiration-item`: new item → ready; duplicate → no upload call, note updated, `duplicate:true`; upload failure → `fail_` called and the error propagates; room linking happens after finalize; a room error still saves the item.
- `capture-tokens` (device-auth): mint, parse, and reject malformed headers and the wrong prefix.
- Routes: 401 without or with a bad token; 413/415/422 mapping; 201 vs 200 duplicate; a rate-limited connect gives 429; error bodies match `ShelfErrorSchema`; no secret appears in captured logs.
- `surfaces`: the inspiration tab appears only when `hasInspiration`; overview counting works.
- Components: the empty state, selection bar counts, the add-to-room dialog submitting the right ids, detail note editing, and the delete confirm.

**Database (pgTAP):** the cases in G3.

**Swift (swift-testing):** each `*Model` with fake client and token store (connect errors shown inline, retry calls the uploader, the room list loads on open); the normalizer for each input type (HEIC, GIF, TIFF, oversize JPEG), with output under the limits; outbox atomic write and restart recovery; the uploader backoff sequence, stop-on-401, the rejected folder for 413/415/422, and deletion only on success (using a `URLProtocol` stub); client multipart encoding; and pasteboard extraction of the image plus the URL.

**E2E (Playwright, fake mode like `MELD_E2E_FAKE_*`):** upload on the Library page → tile appears → add to room → the room shows the Inspiration tab → remove from room → the tab disappears while the image stays in the Library → delete.

**Manual acceptance on the owner's Mac (with screenshots in `.context/`):**
1. Drag from Pinterest in Safari → ✓ → appears in the Library with its source link.
2. Copy an image in Figma → ⌥⌘O → appears.
3. A HEIC photo from Photos → saved as JPEG.
4. Quit Orion's web server → save 3 images → badge "3" → restart → all 3 arrive once.
5. Save the same image twice → one tile.
6. Shelf "also add to room" → the room's Inspiration tab shows it.
7. Disconnect in Settings → the shelf shows the warning → reconnect with a new code → waiting images upload.

---

## Part I — Delivery order (for subagent-driven execution)

Tasks in the same wave can run in parallel. Each task ends with the G4 checks.

| Wave | Task | Depends on |
|---|---|---|
| 1 | **T1** Contracts + limits (`packages/contracts/src/inspiration.ts`) | — |
| 1 | **T2** Capture-token helpers in `packages/device-auth` | — |
| 1 | **T3** Migration + pgTAP (tables, bucket, RLS, all RPCs) | — |
| 1 | **T4** Package.swift scaffold + ShelfCore Capture/ and Outbox/ + Limits (+ tests) | — |
| 2 | **T5** `image-validation`, `inspiration-repository`, `save-inspiration-item` | T1, T3 |
| 2 | **T6** ShelfCore Network/, Auth/, Upload/ (+ tests) against the contract shapes | T1, T4 |
| 3 | **T7** API routes + `shelf-server.ts` + `shelf-rate-limit.ts` + env docs | T2, T5 |
| 3 | **T8** Readers + actions + `shelf-connection.ts` | T5 |
| 4 | **T9** Library page, tile, detail, selection, add-to-room dialog, sidebar item, client image prep, refresh on focus | T8 |
| 4 | **T10** Room surface (`surfaces.ts`, tab, library picker) | T8 |
| 4 | **T11** Settings → Shelf page | T8 |
| 4 | **T12** Shelf app: App/, StatusItem/, Panel/, Connect/, Settings/, Hotkey/, Design/, models + model tests, build-app.sh, README | T6, T7 |
| 5 | **T13** E2E spec + manual acceptance run with screenshots | all |

After T13, update `docs/product-feature-checklist.md` with a new section "Inspiration (Orion Step 1)" whose rows match the acceptance list above.
