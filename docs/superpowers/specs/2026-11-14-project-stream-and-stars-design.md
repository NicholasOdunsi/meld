# Project stream and Stars — "one chat, many stars"

Status: agreed in brainstorm 2026-11-14 · spec written 2026-11-14 · Owner: Nicholas Odunsi
Wire (open in a browser): `2026-11-14-project-stream-wire-screens.html` (stream + To-do) and `2026-11-14-project-stream-wire-panels.html` (the four panel states)
Replaces: the per-chat tab bar and the Conversation / Canvas / PRD / Prototype / Overview tabs from `2026-11-09-orion-app-structure-design.md` (the sidebar, Overview page and hat status from that spec stay).

---

## Part A — Read this first (plain language)

### Why this exists

Today a project is a row of chat tabs, and inside each tab there is a second header with its own row of tabs (Conversation, Canvas, PRD, Prototype, Overview). That is two headers stacked, and it makes a project feel like a filing cabinet. You want it to feel like one conversation where you **orchestrate** work, like a Discord channel or a Cursor / Claude project.

### What you will see

**One glass header, always.** Left to right: the Orion logo, the project name, then on the right three icon buttons: **To-do**, **Canvas**, **Artifacts**. There is no second header and no tab row.

**One stream per project.** Open a project and you are in its stream, laid out like Discord: a profile picture, a name and a time on every message. When Orion answers, the reply sits under your message with the small quoted line above it ("↱ Odunsi: Compare how Stripe and Linear…"). Replies are not a separate page, you just keep talking.

**Every piece of work is a Star.** When you ask Orion for something, the reply carries a **Star** chip: its title and its state (Working, Needs you, Done). Related stars are grouped into a **Constellation** (for example "Upgrade & payment").

**One right-hand panel.** Clicking a Star chip, or any of the three header icons, opens the same panel beside the stream. The stream stays where it was, so you can keep orchestrating while a star works. The panel has four states:

1. **To-do.** Every star in the project and its state, grouped into constellations. Click one to go into it.
2. **A Star.** What you asked, what Orion is doing, what it has made so far, and the star's own piece of the canvas. "Reply in this star" keeps follow-ups attached to it. A back arrow returns to To-do.
3. **Canvas.** Can grow to take most of the window; the chat shrinks to a narrow strip and the sidebar folds to icons. One labeled section per star. Focus a single star, or choose "All sections" to see the whole Project canvas.
4. **Artifacts.** Every document and file the project has produced (PRD, prototype screens, sketches, reference images, support summaries), each tagged with the star it came from.

**What goes away.** The tab bar, the room header, the Conversation / Canvas / PRD / Prototype / Overview tabs, and the stage-coaching pill. Nothing is deleted from the database. The PRD and prototype become artifacts you open from the panel.

### What "done" looks like

- A project screen has exactly one header (logo, project name, To-do, Canvas, Artifacts).
- The stream looks like the Discord reference: avatar, name, time, quoted-reply line on Orion's answers.
- Every Orion answer to a request has a Star chip with a live state.
- Clicking a Star chip, or a To-do row, opens that star in the panel without leaving the stream.
- To-do lists every star with its state and groups related ones.
- Canvas expands to most of the window and shows one section per star.
- Artifacts lists the PRD, prototype and files with the star each came from.
- In a browser the same structure works; in the Mac app the header is native glass.

### Build order (each step is its own plan and ships on its own)

1. **Shell and stream.** The one header, the panel frame that opens and closes, the Discord-style stream, and the quoted-reply line. Panel icons exist but open empty states.
2. **Stars and To-do.** Star chips, the Star panel, and the To-do panel, with grouping into constellations.
3. **Artifacts panel.**
4. **Canvas panel.** Per-star sections, expand to full width, Project canvas view.

Steps 1–2 are "what we are going to achieve first". Steps 3–4 come right after and reuse the panel from step 1.

---

## Part B — Decisions made for you (and why)

| Decision | Why |
|---|---|
| **A project has one stream.** It is the project's first room ("Main"). New projects already get one. | Matches "one chat interface". Rooms already hold messages, attachments, the PRD and the canvas, so nothing new is needed to store the stream. |
| **Other rooms a project already has are kept**, listed at the bottom of the To-do panel as "Earlier chats". Opening one swaps the stream to it. New chats are no longer created. | Nothing is lost or migrated. It also removes the tab clutter without a data change. Say so if you would rather merge them into Main. |
| **A Star is a reply task, plus a title and a constellation.** Each reply to a request is already an AI task tied to the message that caused it. A star adds a short title and an optional constellation on top of that task. | Reuses the task machinery that already tracks Working / Done and already links a reply to its source message. No second system for "what is Orion doing". |
| **Constellations are suggested by Orion, editable by you.** Orion proposes a group when a new star is similar to existing ones; you can rename, move or ungroup. | You wanted similar work to stay together without having to file it. |
| **One canvas board per project, with a labeled section per star.** The room's existing board is the Project canvas; a star's canvas is its section on that board. | The room already has exactly one board. Sections give "each star has its own canvas" and "mix them up, but section them" without multiple boards to sync. |
| **To-do, Artifacts and Canvas share one panel**, one open at a time. Canvas can expand; the others stay a fixed width. | One place for side content keeps the stream calm and is how you described it. |
| **The header is native in the Mac app** (logo, project name, three icons, in the traffic-light line). Clicking an icon tells the page which panel to open; the page tells the header the To-do count. | Same pattern the app already uses: the page owns the data, the app draws it. Gives real Liquid Glass. |
| **In a browser, the web page draws the same header.** The Mac app adds `OrionFrame/2` to its user agent; the page drops its own header only for that. | Older Mac versions and browsers must never end up with no header while the update rolls out. |
| **PRD, decisions, prototype and inspiration become artifacts**; Overview as a room tab and the stage coach pill are retired. Their code and tables stay. | You asked to drop the PRD / prototype / overview tab idea. Keeping the data means artifacts can show them and nothing is lost. |
| **The name is "Star" / "Constellation".** | Orion's constellation theme; the second level answers "similar work stays together". |
| Glass on the header and sidebar only; the stream and panel stay solid. | Apple HIG (Materials): glass for navigation, never for content. |

---

## Part C — Technical design

### Header and frame

- Mac: replace `DetailTopBar` / `ProjectTabBar` with a native toolbar block in `OrionFrameView`: logo, project name, and three toggle buttons (To-do with a count badge, Canvas, Artifacts). `FrameModel` gains `activePanel` (none, todo, star, canvas, artifacts) and `todoCount`, both mirrored through the existing frame snapshot / bridge in `Bridge/NativeBridge.swift` and `features/native/native-frame-bridge.tsx`. Remove the tab-related code (`TabOverflow`, new-tab command) once nothing else uses it.
- Web: the room page stops rendering `ProjectTabs`, `RoomHeader` and `RoomTabStrip`. When the user agent is not the Mac frame, a small web header with the same three buttons renders instead.
- The page root becomes a two-column layout: stream, and the panel host. The panel host holds one of four panel components. Panel state lives in the URL (`?panel=todo|star:<id>|canvas|artifacts`) so it survives reloads and the Mac app's "remember last page".

### Stream

- Reuses the existing `Conversation` data (messages, realtime subscription, composer). The message row component is rebuilt in the Discord layout: avatar, name, time, flat spacing, a "AI" tag for Orion, and a quoted-reply line above an Orion message that has a source message.
- The quoted-reply line comes from the reply task's source message id (already stored). No new column on `messages`.
- Orion replies with a Star show the chip under the text. Click opens `?panel=star:<id>`; the message row gets a highlight rail while its star is open.

### Stars

- New table `room_stars`: `id`, `room_id`, `task_id` (the reply task), `title`, `constellation_id` (nullable), timestamps. New table `room_constellations`: `id`, `room_id`, `name`, timestamps.
- State shown on the chip and in To-do is derived from the task: running → Working, `needs input` → Needs you, finished and seen → Done. The existing activity / "needs you" logic (`workspace_activity`) is the source for Needs you and feeds the hat status unchanged.
- The title is generated when the star is created (short DeepSeek call, same provider already used for sorting); fallback is the first words of the request.
- Constellation grouping runs when a star is created, comparing its title against existing stars in the project. If it matches, the star is placed in that constellation immediately (no confirmation prompt); if several stars match each other but have no constellation yet, Orion creates one and names it. The user can rename, move or ungroup at any time from To-do.

### Panels

- **To-do:** a list query over `room_stars` joined to the task state, grouped by constellation, filtered Open / Done. Footer lists earlier chats.
- **Star:** the messages of that star (the source message, the reply, follow-ups sent with "Reply in this star"), the task's step list (from `ai_task_events`), artifacts linked to it, and a canvas preview of its section with an Expand button.
- **Artifacts:** a read query unioning PRDs, design screens, prototype, inspiration items and uploaded files for the room, each with its star (where known) and a kind filter. Existing viewers (PRD document, prototype viewer) render inside the panel when an item is opened.
- **Canvas:** the existing Excalidraw board (`BoardLoader`) mounted in the panel. A star's section is an Excalidraw frame named after the star, created when the star first draws something. "Focus" scrolls and zooms to a frame; "All sections" is the whole board. Expand sets a wide-panel mode that narrows the stream and folds the sidebar to icons.

### Errors and edges

- A request that produces no work (a plain chat answer) gets no Star; only task-backed replies do.
- If the title call fails, the fallback title is used and no error is shown.
- If a task fails, the star shows "Stuck" with the reason and counts as Needs you.
- A project with no stars shows an empty To-do: "Ask Orion for something and it will show up here."
- Panels are keyboard reachable and respect Reduce Motion for the expand animation.

### Testing

- Unit: state derivation (task → star state), constellation grouping, title fallback, `?panel=` parsing.
- Component: message row (avatar, quoted line, chip), panel host switching, To-do grouping.
- Database: `room_stars` / `room_constellations` RLS (a user sees only their rooms' stars) via pgTAP, using the branch-pure scratch-DB recipe.
- Mac: `FrameModel` panel state and snapshot round-trip; build must pass `xcodebuild`.
- E2E: open a project, send a request, see a star chip appear, open it, switch to To-do and back.

---

## Part D — Out of scope for this spec

- Teaching the chat to open agents or create stars from a typed command ("send the design agent to…"). Stars come from ordinary requests for now.
- Rewriting Inspiration, Taste or Overview. They are unchanged.
- Multi-person features (mentions, presence in the stream). Orion is single-user.
- A visual-language restyle. This build changes structure; styling uses existing tokens.
