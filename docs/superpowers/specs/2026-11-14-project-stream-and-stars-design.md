# Project stream and Stars — "one chat, many stars"

Status: agreed in brainstorm 2026-11-14 · spec written 2026-11-14 · Owner: Nicholas Odunsi
Wire (open in a browser): `2026-11-14-project-stream-wire-screens.html` (stream + To-do) and `2026-11-14-project-stream-wire-panels.html` (the four panel states)
Replaces: the per-chat tab bar and the Conversation / Canvas / PRD / Prototype / Overview tabs from `2026-11-09-orion-app-structure-design.md` (the sidebar, Overview page and hat status from that spec stay).

---

## Part A — Read this first (plain language)

### Why this exists

Today a project is a row of chat tabs, and inside each tab there is a second header with its own row of tabs (Conversation, Canvas, PRD, Prototype, Overview). That is two headers stacked, and it makes a project feel like a filing cabinet. You want it to feel like one conversation where you **orchestrate** work, like a Discord channel or a Cursor / Claude project.

### What you will see

**One glass header, always.** Left to right: the **project's own icon and name** (no Orion logo, the sidebar already carries that), then on the right three icon buttons: **To-do**, **Canvas**, **Artifacts**. There is no second header and no tab row.

**One stream per project, on glass.** Open a project and you are in its stream, laid out like Discord: a profile picture, a name and a time on every message. When Orion answers, the reply sits under your message with the small quoted line above it ("↱ Odunsi: Compare how Stripe and Linear…"). Replies are not a separate page, you just keep talking. The stream sits directly on the same glass as the rest of the window.

**Native, except the canvas.** The header, the stream, the composer, and the To-do, Star and Artifacts panels are all native Mac (SwiftUI). Only the Canvas stays web, because it is Excalidraw.

**The composer is the Taste composer.** The chat uses the same frosted composer as Taste, with one addition: a **model selector**. The Orion hat and the "Orion" title with the glowing line are removed from the composer, in Taste too. Messages that used to appear beside that title (errors, hints) become a **pill** that slides up above the composer, outside it, and slides back down when it goes away.

**Every piece of work is a Star.** When you ask Orion for something, the reply carries a **Star** chip: its title and its state (Working, Needs you, Done). Related stars are grouped into a **Constellation** (for example "Upgrade & payment").

**One right-hand panel.** Clicking a Star chip, or any of the three header icons, opens the same panel beside the stream. The stream stays where it was, so you can keep orchestrating while a star works. The panel has four states:

1. **To-do.** Every star in the project and its state, grouped into constellations. Click one to go into it.
2. **A Star.** What you asked, what Orion is doing, what it has made so far, and the star's own piece of the canvas. "Reply in this star" keeps follow-ups attached to it. A back arrow returns to To-do.
3. **Canvas.** Can grow to take most of the window; the chat shrinks to a narrow strip and the sidebar folds to icons. One labeled section per star. Focus a single star, or choose "All sections" to see the whole Project canvas.
4. **Artifacts.** Every document and file the project has produced (PRD, prototype screens, sketches, reference images, support summaries), each tagged with the star it came from.

**What goes away.** The tab bar, the room header, the Conversation / Canvas / PRD / Prototype / Overview tabs, and the stage-coaching pill. Nothing is deleted from the database. The PRD and prototype become artifacts you open from the panel.

### What "done" looks like

- A project screen has exactly one header (project icon, project name, To-do, Canvas, Artifacts).
- The stream looks like the Discord reference: avatar, name, time, quoted-reply line on Orion's answers, on the window's glass.
- The composer is the Taste composer with a model selector, no hat or "Orion" title, and errors arrive as a sliding pill above it (in Taste as well).
- Every Orion answer to a request has a Star chip with a live state.
- Clicking a Star chip, or a To-do row, opens that star in the panel without leaving the stream.
- To-do lists every star with its state and groups related ones.
- Canvas expands to most of the window and shows one section per star.
- Artifacts lists the PRD, prototype and files with the star each came from.
- In the Mac app everything except the canvas is native. A browser keeps the existing room page until you decide to retire it (see Part B).

### Build order (each step is its own plan and ships on its own)

0. **Composer refresh.** In Taste only: take the hat and "Orion" title out of the composer, and turn errors and hints into the sliding pill. Small, safe, and it produces the composer the stream will reuse.
1. **Native shell and stream.** The one header, the native panel frame that opens and closes, the glass Discord-style stream with the quoted-reply line, the shared composer with the model selector, and the new app-facing endpoints for messages. Panel icons exist but open empty states.
2. **Stars and To-do.** Star chips, the native Star panel, and the native To-do panel, with grouping into constellations.
3. **Artifacts panel.**
4. **Canvas panel.** The web Excalidraw board hosted in the panel: per-star sections, expand to full width, Project canvas view.

Steps 0–2 are "what we are going to achieve first". Steps 3–4 come right after and reuse the panel from step 1.

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
| **The header is native** (the project's icon and name, then To-do with a count badge, Canvas, Artifacts, in the traffic-light line). No Orion logo. | The sidebar already carries the Orion identity; the header says where you are. Real Liquid Glass comes only from native controls. |
| **The stream, composer and the To-do / Star / Artifacts panels are native SwiftUI.** Only the Canvas is web (Excalidraw has no native form) and is hosted in the panel. | Your call (2026-11-14). It follows the plan for the Mac app: native screens one at a time. It also means the stream needs new app-facing endpoints for messages and stars, because the app cannot reuse the web page's server rendering. |
| **The browser keeps the existing room page, unchanged, for now.** It is not rebuilt in the new design. | Rebuilding the stream a second time for the browser would double the work for a single-user, Mac-first product. Say so if you want the browser version redone too, or removed. |
| **The chat composer is the Taste composer** (`FrostedComposer`), pulled into one shared component, plus a **model selector** in its bottom bar. The model list and the "override per message" behaviour come from the existing room composer. | One composer look everywhere, as you asked. The model override already exists on the server (`providerOverride` / `modelOverride`). |
| **The hat and "Orion" title are removed from the composer**, in Taste too. | Your call: the composer should be just the input. The title was also taking the line the status text needed. |
| **Errors and hints become a status pill** that slides up above the composer, outside it, and slides back down when dismissed or after about 5 seconds (errors stay until dismissed). Taste's current in-composer error text and the window-level "couldn't do that" alert for composer errors move to it. | Messages stay visible without resizing or crowding the composer. |
| **PRD, decisions, prototype and inspiration become artifacts**; Overview as a room tab and the stage coach pill are retired. Their code and tables stay. | You asked to drop the PRD / prototype / overview tab idea. Keeping the data means artifacts can show them and nothing is lost. |
| **The name is "Star" / "Constellation".** | Orion's constellation theme; the second level answers "similar work stays together". |
| **The stream sits directly on the window glass** (same as the rest of the window). Message text is white on a slightly darker glass tint so long replies stay readable; the panel uses the same glass. | Your call. Apple's guidance prefers solid content, so the tint and contrast are checked in testing and the tint can be raised without changing the layout. |

---

## Part C — Technical design

### Header and frame

- Replace `DetailTopBar` / `ProjectTabBar` with a native toolbar block in `OrionFrameView`: the project's mark (`ProjectMark`) and name, and three toggle buttons (To-do with a count badge, Canvas, Artifacts). `FrameModel` gains `activePanel` (none, todo, star, canvas, artifacts) and `openStarID`, persisted per project so "remember last page" still works. Remove the tab-related code (`TabOverflow`, new-tab command, `FrameTab`) once nothing else uses it.
- The detail column becomes: stream, and an optional panel host on the right. The panel host holds one of four panel views. Canvas mode widens the panel and folds the sidebar to icons.
- The Canvas panel hosts the existing web board (`BoardLoader` for the project's room) in a web view, using the native bridge that already exists for web content inside the app.
- The browser keeps `ProjectTabs`, `RoomHeader` and `RoomTabStrip` unchanged. The Mac app adds `OrionFrame/2` to its user agent; the room page already hides its own header when it detects the frame, and the Mac app no longer shows the room page for project chats at all (only the Canvas panel's web view).

### Stream (native)

- New app-facing endpoints, same device-pairing auth as `/api/shelf/*`: list messages for a project's stream (paged, newest last), post a message (with attachments and an optional `providerOverride` / `modelOverride`), and read a message's source link. They call the same server code as the web actions (`postMessage`, `createRoomReplyTask`) so permissions and task creation behave identically.
- Live updates: while a project's stream is on screen, the app polls the list endpoint every 3 seconds while any star is Working and every 15 seconds otherwise, and pulls immediately after sending. The existing realtime subscription is web-only and is not ported; polling is chosen because the app has no Supabase realtime client and the stream is single-user. Revisit if it feels laggy.
- `StreamView` is a native list of message rows: avatar, name, time, flat spacing, an "AI" tag on Orion, and a quoted-reply line above an Orion message that has a source message. The quoted line comes from the reply task's source message id (already stored). No new column on `messages`.
- Orion replies with a Star show the chip under the text. Click sets `openStarID`; the message row gets a highlight rail while its star is open.
- Messages sit on the window glass (`WindowGlass.content`) with a darker tint behind the text column.

### Composer (shared)

- Extract the reusable shell from `Taste/Composer/FrostedComposer.swift` (ice glass, resting bar, grow animation, `+` menu, send button, attachments chips) into a shared `OrionComposer` with slots: a bottom-bar accessory (the model selector in chat; nothing in Taste) and a send handler. Taste keeps its own reading phase and board-specific draft.
- Remove `title(isSweeping:)` (hat, "Orion", `CyanBrushStroke`) and the `chromeOpacity` choreography that only served it. `CyanBrushStroke` is deleted if nothing else uses it. The resting text becomes the screen's own prompt ("Tell Orion something…" in Taste, "Message <project>…" in chat).
- **Status pill:** a separate view, `ComposerStatusPill`, positioned in the same stack just above the composer, outside its glass. It carries a message and a kind (hint or error). It slides up from behind the composer top edge (offset + opacity, ~0.28s, respecting Reduce Motion with a plain fade) and slides back down on dismiss. Hints auto-dismiss after about 5 seconds; errors stay until tapped or until the next send. `FrostedComposer.statusMessage` and the Taste screen's `model.store.errorMessage` hand-off to `frame.errorMessage` both feed this pill. The stream's send errors use it too.
- **Model selector:** a compact menu in the composer's bottom bar showing the current model; choices come from the same provider/model list the web composer uses, via a new read endpoint. The choice is remembered per project and sent as the override on each message.

### Stars

- New table `room_stars`: `id`, `room_id`, `task_id` (the reply task), `title`, `constellation_id` (nullable), timestamps. New table `room_constellations`: `id`, `room_id`, `name`, timestamps.
- State shown on the chip and in To-do is derived from the task: running → Working, `needs input` → Needs you, finished and seen → Done. The existing activity / "needs you" logic (`workspace_activity`) is the source for Needs you and feeds the hat status unchanged.
- The title is generated when the star is created (short DeepSeek call, same provider already used for sorting); fallback is the first words of the request.
- Constellation grouping runs when a star is created, comparing its title against existing stars in the project. If it matches, the star is placed in that constellation immediately (no confirmation prompt); if several stars match each other but have no constellation yet, Orion creates one and names it. The user can rename, move or ungroup at any time from To-do.

### Panels (native, except Canvas)

Each panel reads from a new app-facing endpoint (same pairing auth) that returns plain data; the app draws it.

- **To-do:** a list query over `room_stars` joined to the task state, grouped by constellation, filtered Open / Done. Footer lists earlier chats.
- **Star:** the messages of that star (the source message, the reply, follow-ups sent with "Reply in this star"), the task's step list (from `ai_task_events`), artifacts linked to it, and a canvas preview of its section with an Expand button.
- **Artifacts:** a read query unioning PRDs, design screens, prototype, inspiration items and uploaded files for the room, each with its star (where known) and a kind filter. Opening an item shows it in the panel: PRD and prototype screens open in a web view of the existing viewers (they are rich documents and stay web for now); images, files and sketches render natively.
- **Canvas (web):** the existing Excalidraw board (`BoardLoader`) in a web view inside the panel. A star's section is an Excalidraw frame named after the star, created when the star first draws something. "Focus" scrolls and zooms to a frame; "All sections" is the whole board. Expand sets a wide-panel mode that narrows the stream and folds the sidebar to icons.

### Errors and edges

- A request that produces no work (a plain chat answer) gets no Star; only task-backed replies do.
- If the title call fails, the fallback title is used and no error is shown.
- If a task fails, the star shows "Stuck" with the reason and counts as Needs you.
- A project with no stars shows an empty To-do: "Ask Orion for something and it will show up here."
- Panels are keyboard reachable and respect Reduce Motion for the expand animation.

### Testing

- Unit (Swift, `OrionAppCore`): star state derivation, constellation grouping, title fallback, `FrameModel` panel state and per-project persistence, status-pill queue (hint auto-dismiss, error stays), polling cadence choice.
- Unit (web): the new endpoints (auth, paging, override passthrough, error shape).
- Native views: message row (avatar, quoted line, chip), panel host switching, To-do grouping, composer pill slide in/out, model selector choice sent as override; screenshots in light and dark with Reduce Transparency on and off to check legibility on glass.
- Database: `room_stars` / `room_constellations` RLS (a user sees only their rooms' stars) via pgTAP, using the branch-pure scratch-DB recipe.
- Mac: build must pass `xcodebuild`; Taste regression check that the composer still reads, and that its errors now appear as the pill.
- E2E: open a project, send a request, see a star chip appear, open it, switch to To-do and back.

---

## Part D — Out of scope for this spec

- Teaching the chat to open agents or create stars from a typed command ("send the design agent to…"). Stars come from ordinary requests for now.
- Rewriting Inspiration or Overview. Taste changes only in its composer (no hat/title, status pill).
- Multi-person features (mentions, presence in the stream). Orion is single-user.
- A visual-language restyle. This build changes structure; styling uses existing tokens.
