# Orion app structure — "chat with your projects"

Status: structure agreed in brainstorm 2026-11-08 · spec written 2026-11-09 · frame moved to native SwiftUI on owner's choice 2026-11-09 · Owner: Nicholas Odunsi
Wire: `2026-11-09-orion-app-structure-wire.html` (open it in a browser)
Comes before: the new Orion visual language, then native Inspiration and Taste
(each gets its own spec).

---

## Part A — Read this first (plain language)

### Why this exists

Orion grew out of Meld, a team tool. Its frame still looks like one: a strip of
workspaces on the far left, then a long sidebar with Home, Search, Mentions,
Inspiration, Design System, Settings, and every project opened up to show every
room inside it. It is busy and it looks like every other app.

You want Orion to feel like yours, and you often have several projects going at
the same time. So the frame is being rebuilt around one idea:

> **You chat with your projects.**

### Where it's built

**In the Mac app, the frame is real native SwiftUI** — the sidebar, the chat
tabs, the New Project sheet, the menus. What's *inside* a tab (the chat, PRD,
canvas, prototype) and the Inspiration/Taste/Settings pages are still the
existing web pages, shown without their own sidebar. Those go native one at a
time later (Inspiration first, then Taste).

**In a web browser** (and in older Mac app versions until they update), Orion
shows the same structure built from web components, so nothing breaks while the
Mac app updates itself.

### What you will see

**The sidebar is short.** From top to bottom:

1. The Orion logo (and the standard Mac button to hide or show the sidebar)
2. A small group of your personal places, together:
   **Home** · **Inspiration** · **Taste** (a dot appears on Taste when Orion
   has suggestions for you)
3. **New project**
4. **Projects** — a plain list of your projects, each with its icon and colour.
   Nothing opens up underneath a project. No rooms, no stages, no clutter.
5. After the projects: **Design System** and **Settings** (in the list, not
   pinned to the bottom edge — Apple warns the bottom of a window often ends up
   off-screen).

The strip of workspaces on the far left is gone. Orion is just you, so there is
only one place.

**Click a project → you're in that project's chat.** The project's name is in
the title bar, and just under it is a bar of **tabs**. The first one is **Main**. Each tab is its
own chat with the AI partner, with its own history. Click **+** to open a new
tab straight away — no form to fill in (⌘T does the same). Click any tab to
switch; nothing you were doing in another tab or another project is lost, and
going back to a project returns you to the tab you were last in. If a project has more
than six tabs, the extra ones tuck into a **More** menu at the end of the bar
(Apple's guideline: no more than six visible tabs).

**Inside a tab is where the work happens.** You talk, attach files, ask for a
PRD, open the canvas or the prototype — all of that already exists and stays.
Those views (Canvas, PRD, Prototype…) sit as a small switch inside the tab, not
as a second row of big tabs.

**Glass.** The sidebar and the tab bar use Apple's own Liquid Glass (macOS 26),
because they are standard native controls — exactly like Finder or Notes. The
chat itself stays solid so text is always easy to read — Apple's rule is glass
for the things you steer with, never for the content. "Reduce transparency" in
macOS settings is respected automatically.

**New Project** (sidebar, or ⌘N) opens a small native sheet: name and colour.
**Rename** and **Delete** are on right-click of a project. Delete says how many
chats go with it.

**Inspiration and Taste stay outside projects.** They are about you, not about
one project, so they live at the top of the sidebar and are reachable from
anywhere.

**The Shelf stays in the menu bar** exactly as it is now.

**The Mac app needs one update** (it will update itself as usual once this is
merged). The website half ships at the same time.

### What comes later (not in this build)

- **"Send an agent to do it" from the chat.** You will be able to say *"open a
  Design pass tab and send the design agent there"* and Orion opens the tab and
  starts the agent. This build gives you the tabs; the next one teaches the chat
  to open them for you.
- **A dot on a project when something in it is working or waiting for you.**
- **Rename or close a tab** from the tab itself.
- **Build / GitHub / Ship / Growth** attach to a project (as tabs or tools inside
  it), never as new items in the sidebar.
- **The new look.** This build changes the *structure*. The new visual language
  is the next spec, and Inspiration and Taste are rebuilt natively after that.

### What "done" looks like

- The sidebar shows only: logo, Home · Inspiration · Taste, New project, your
  projects, then Design system / Settings.
- Clicking a project opens its Main tab. A brand-new project already has Main.
- **+** opens a new chat tab in that project instantly.
- Switching tabs and projects keeps each chat's history.
- Inspiration, Taste and Settings still work.
- In the Mac app all of the above is native SwiftUI with Liquid Glass; in a
  browser the same structure is built from web components.

---

## Part B — Decisions made for you (and why)

| Decision | Why |
|---|---|
| A **tab is an existing Room**. A project's tabs are its rooms, oldest first. | Rooms already are chats with history, attachments, PRD, canvas and prototype. No new database tables, nothing to migrate, nothing lost. |
| **Main** = the project's first room. New projects get a room called "Main" automatically. Opening a project with no rooms creates one. | Every project opens straight into a chat — never an empty page. |
| **+** creates a room called "New chat" (then "New chat 2", …) and opens it. | One click, no dialog — matches "spawn a tab". Renaming comes later. |
| Tabs cannot be closed in this build. Delete stays in the room's existing menu. | Closing a tab would really delete a chat. That needs an archive, which is its own small project. |
| The room's own views (Conversation, Canvas, PRD, Prototype, Inspiration, Decisions, Overview) stay, shown as a compact switch inside the tab. | Keeps every feature working. The two-level look is a known compromise the visual-language spec will resolve. |
| The workspace strip is removed from the UI. The `workspaceId` stays in every URL. | Single user. Keeping the URL shape means no links, Shelf pairing, or Mac "remember last page" break. |
| **Taste** gets its own sidebar item that opens the existing `?tab=taste` view. The waiting-suggestions dot moves from Inspiration to Taste. | Taste was hidden as a tab inside Inspiration; the agreed structure gives it its own place. |
| Search and Mentions (never wired up) are removed. **Home** joins Inspiration and Taste as one personal group at the top (owner request 2026-11-09); the logo also goes Home. | They were placeholders; "Mentions" belongs to the team product. |
| **The frame is native SwiftUI** (owner's choice 2026-11-09): `NavigationSplitView` sidebar + a segmented tab bar; web pages render content only inside it. | Real Liquid Glass and Mac behaviour only come from native controls; the page content is big and already works, so it stays web for now and goes native screen by screen. |
| **The page owns the data; the app draws it.** The page posts a "frame" snapshot (projects, tabs, taste dot, current address) over the existing bridge; the app asks the page to open/create/rename/delete through the same server actions the web uses. | No second sign-in, no new API, no new security surface: everything still runs as the signed-in person through existing permission checks. |
| Glass on the navigation layer only (sidebar + tab bar); content stays solid. | Apple HIG (Materials): Liquid Glass is for controls and navigation, never the content layer. |
| Sidebar can be hidden (toolbar button, View ▸ Hide Sidebar, ⌃⌘S), visible by default; hidden entirely while signed out. | Apple HIG (Sidebars): let people hide it with familiar commands; never hide it by default. |
| Older Mac app versions and browsers keep a web-built sidebar with the same structure. The new app adds `OrionFrame/1` to its user agent; only then does the page drop its own sidebar and tabs. | The website and the Mac update ship minutes apart; nobody is ever left with no sidebar. |
| Max six visible project tabs; the rest go in a "More" menu. | Apple HIG (Tab views). |
| Built with the current Astryx components and tokens. | The repo rule; the new visual language will restyle it later without changing the structure. |

---

## Part C — Technical design

### Routes

| URL | Behaviour |
|---|---|
| `/[workspaceId]` | Home (unchanged). Logo links here. |
| `/[workspaceId]/projects/[projectId]` | **New.** Server page: `openProject()` finds the project's first room (oldest `createdAt`); if none, creates "Main"; then `redirect` to that room. Unknown project → redirect home. |
| `/[workspaceId]/rooms/[roomId]` | Unchanged route; renders `ProjectTabs` above the existing room UI — except inside the native frame. |
| `/[workspaceId]/inspiration` and `?tab=taste` | Unchanged. |

### New / changed modules (apps/web)

- `features/projects/project-tabs.ts` — pure helpers, unit tested:
  - `orderProjectTabs(rooms, projectId)` → that project's rooms sorted oldest
    first (ties broken by id).
  - `nextTabName(existingNames)` → `"New chat"`, then `"New chat 2"`, `"New chat 3"`…
    (first free number).
  - `MAIN_TAB_NAME = "Main"`.
- `features/projects/open-project.ts` (server-only) — `openProject({ workspaceId, projectId })`
  returns the room id to show (existing first room or a newly created "Main").
- `features/projects/actions.ts`
  - New `deleteProjectAndChats` — the sidebar's Delete removes the project's
    chats first, then the project (the old rule "move or delete every room
    first" no longer makes sense when every project has Main). The dialog says
    how many chats will go.
  - `createProject` also creates the "Main" room and returns `mainRoomId`
    (best effort: if room creation fails the project still exists and
    `openProject` will create Main on first open).
  - New server action `createProjectTab({ workspaceId, projectId })` →
    `{ status: "ok", roomId } | { status: "error", message }`. Names the room
    with `nextTabName` over the project's current room names, then
    `revalidatePath(/[ws], "layout")`.
- `features/projects/components/project-tabs.tsx` (client) — Astryx `Tabs`/tab
  strip: one tab per room (link to the room), selected = current room, trailing
  **+** button calling `createProjectTab` then `router.push` to the new room.
  Shows the project name and icon at the left.
- `ui/orion-sidebar.tsx` (client) — replaces `ui/workspace-navigation.tsx` in the
  workspace layout. Astryx `SideNav` (collapsible, button in header, ⌃⌘S):
  header = Orion logo + "Orion" → home;
  personal section = Home, Inspiration, Taste (+ `StatusDot` when `hasTasteUpdates`);
  "New project" item opening the existing `CreateProjectDialog`
  (on success → navigate to the new project);
  "Projects" section = one `SideNavItem` per project (existing project icon +
  colour), `href` = `/[ws]/projects/[id]`, selected when the current room
  belongs to that project; a hover `⋯` menu offering Rename / Delete via the
  existing dialogs;
  footer = Design system, Settings.
- `app/(app)/[workspaceId]/layout.tsx` — renders `OrionSidebar`; stops loading
  the workspace list and attention summary. When the user agent carries
  `OrionFrame/1` (`isOrionFrameUserAgent`), renders no sidebar and mounts
  `NativeFrameBridge` instead.
- `features/native/native-frame-bridge.tsx` (client, invisible) — posts
  `{ v: 1, type: "frame", workspaceId, path, projects, tabs, hasTasteUpdates }`
  whenever data or address changes; registers `window.__orionFrame` with
  `navigate(path)` (site paths only), `createProject`, `createTab`,
  `renameProject`, `deleteProject`, each resolving to
  `{ status: "ok", path? } | { status: "error", message }`.
- `app/(app)/[workspaceId]/rooms/[roomId]/page.tsx` — loads the room's project
  rooms (already available via `listRooms`) and renders `ProjectTabs` above the
  existing header; the existing `RoomTabStrip` stays below it.
- `ui/workspace-navigation.tsx` and `features/projects/components/project-room-navigation.tsx`
  are left in the repo this build (unused) and removed in the clean-up task
  once the new frame is accepted.

### Mac app (apps/mac) — the native frame

- `OrionAppCore/Frame/` (pure, unit tested): `FrameSnapshot` (decoded from the
  bridge, lenient per row), `FrameProject`, `FrameTab`, `FrameDestination`
  (sidebar place ⇄ page address), `TabOverflow` (≤6 visible, selected always
  visible), `FrameCallResult`, `FramePages` (sign-in/onboarding hide the frame).
  `BridgeMessage` gains `.frame`.
- `Orion/Frame/`: `FrameModel` (`@Observable`, `@MainActor`; remembers the last
  tab per project; optimistic sidebar highlight; errors → alert),
  `FrameCommanding` (implemented by `WebViewController` via
  `callAsyncJavaScript`; falls back to a full page load when no page answers),
  `OrionFrameView` (`NavigationSplitView`; tab bar via `safeAreaBar(edge: .top)`),
  `FrameSidebar`, `ProjectRow`, `ProjectStyle` (web icon/colour keys → SF Symbols
  / system colours), `ProjectTabBar` (segmented, "More" menu, +),
  `NewProjectSheet`, `OrionWordmark`, `FrameCommands` (⌘N New Project, ⌘T New
  Chat Tab) plus `SidebarCommands` (View ▸ Show/Hide Sidebar, ⌃⌘S).
- `WebViewController` user agent becomes `OrionMac/<v> OrionFrame/1`.
  `MainWindowController` bridges the SwiftUI toolbar/title into the window
  (`sceneBridgingOptions = [.toolbars, .title]`).
- A project address (`/projects/<id>`) is a server redirect; the app opens the
  project's first chat directly and only full-loads the project address when
  the project has no chats yet (a client-side navigation into a redirect left
  WKWebView blank in testing).

### Data

No migrations. Uses the existing `create_room` RPC and room/project reads.
Room order uses `createdAt`; if the room list does not carry it, add it to the
`listRooms` result type (read only).

URLs keep their shape, so "remember last page", notifications and Shelf deep
links (`/inspiration?item=…`) are unchanged.

### Testing

- Unit: `project-tabs.ts` (ordering, naming), `createProjectTab` (naming,
  error path), `openProject` (existing room vs creates Main) against the fake
  backends.
- Component: `OrionSidebar` (shows exactly the agreed items; no rooms rendered;
  project selection; taste dot), `ProjectTabs` (tabs in order, selected tab, +
  calls the action and navigates).
- Update/retire tests that assert the old navigation in the layout.
- Bridge: `native-frame-bridge.test.tsx` (snapshot posting, site-only
  navigation, results and failures). Swift: `FrameTests`, `FrameCallResultTests`,
  `FramePagesTests`, `FrameModelTests` (fake commander).
- Manual (done 2026-11-09 against a local demo-data server and a separately
  bundled test copy of the app): sidebar, tab switch, +, project switch and
  return-to-last-tab, Taste, New Project sheet → Main, signed-out state.

### Delivery order

1. `project-tabs.ts` helpers + tests. *(independent)*
2. `openProject` + `/projects/[projectId]` route + tests. *(after 1)*
3. `createProjectTab` action; `createProject` creates Main. *(after 1)*
4. `ProjectTabs` component + room page wiring. *(after 3)*
5. `OrionSidebar` + layout swap. *(after 2; parallel with 4)*
5b. Native frame: OrionAppCore logic + tests → bridge `frame` message and
    `window.__orionFrame` → SwiftUI views → window wiring. *(after 3)*
6. Typecheck, lint, full web test run, browser walk-through, screenshots.
7. Later, own tasks: delete old navigation; dictate-to-spawn tabs; project
   activity dots; tab rename/close; visual language spec.

---

## Part D — Self-review

- **Is anything lost?** No data or features: rooms, chats, PRD, canvas,
  prototype, Inspiration, Taste, Settings and Design system are all still
  reachable. Removed: the workspace strip (single user), and the never-working
  Search/Mentions placeholders.
- **Biggest risk:** two rows of tabs inside a project (project tabs + the room's
  view switch). Accepted for now and called out; the visual-language spec owns it.
- **Second risk:** naming. A tab is still called a "room" in code and in some
  room UI copy. User-facing copy in the new pieces says "tab"/"chat"; older room
  copy is left until the visual pass.
- **Old projects** with several rooms: their rooms simply appear as tabs,
  oldest first. The oldest is the leftmost, not literally named "Main" — fine,
  and renaming arrives later.
- **Delete got stricter in one way, looser in another:** deleting a project now
  deletes its chats too (with a clear count in the confirm dialog). Without
  this, every project would be undeletable because it always has Main.
- **Apple HIG check:** two-level max in sidebar ✓ (flat list), selection
  persistently highlighted ✓, sidebar hideable (button, View menu, ⌃⌘S) and
  shown by default ✓, ≤6 visible tabs ✓, glass only on navigation ✓ (system
  controls), nothing critical pinned to the bottom ✓, menu commands for the
  main actions ✓ (⌘N, ⌘T).
- **Native/web seam:** the frame only knows what the page last told it. If the
  page is still loading, a click falls back to a full page load; if a command
  has no page to run in, the person gets a plain "Orion isn't ready yet" alert.
- **Not checked yet:** the real Orion Online data and the real signed-in app —
  that needs this merged and the Mac release installed.
- **Not in scope and not pretended:** the AI opening tabs on its own, project
  activity dots, closing tabs.
