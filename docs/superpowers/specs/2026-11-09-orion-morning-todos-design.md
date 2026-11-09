# Orion: morning to-dos

Status: design agreed in brainstorm 2026-11-09 · spec approved by owner 2026-11-09 · revised the same day to match the current Mac Overview (Todo → In progress → Completed, a project per line) · Owner: Nicholas Odunsi
Builds on: `2026-11-09-orion-app-structure-design.md` (native frame + bridge) and the
native Overview (quote · Todo) on branch `NicholasOdunsi/orion-app-structure`.
Replaces: the "Needs you" list from `2026-11-09-orion-overview-and-working-hats-design.md`.

---

## Part A — Read this first (plain language)

### What this is

Every morning at **6:00 am your time**, Orion goes through your projects and
writes the things you should pick up into the **Todo** on the Overview. Its
lines look exactly like the ones you write yourself: a short line like
"Update the user flow for sign-up" with the project picked. If one isn't
useful, delete it like anything else.

### What changes on the Overview

- **Needs you is removed** everywhere, in the Mac app and in the browser.
  The morning to-dos take its place.
- **Todo is saved.** Today your to-dos disappear when Orion quits. After this,
  they're saved online, so they survive restarts and Orion can add to them.
- The browser Overview gets the same Todo. All projects stays.
- The Mac Overview keeps its quote, the Todo list with a project picker on each
  line, the **Orchestrate** button, and the **In progress** and **Completed** lists.
  All three lists are saved, so they survive quitting Orion.

### What Orion reads

Only projects that **changed since the last morning run**. Projects that didn't
change are skipped. For each changed project it looks at:

- the chats in every tab: what you said, what the AI said, anything left hanging
- PRD versions and screens, to see what's planned versus what exists
- decisions recorded in the rooms
- AI work that failed, got stuck, or finished without you opening it

### What Orion writes

- New lines at the end of your Todo, each with its project picked.
- At most **5 new lines per project per morning**.
- Nothing marks a line as Orion's. It looks like yours.

### What Orion never does

- Re-add a to-do you deleted before.
- Add a to-do that's already on your list, in progress, or completed.
- Change your own lines.
- Start any AI work. Orchestrate stays your click.

### Your time zone

Orion takes it from your Mac automatically and updates it if you travel. Until
the Mac has reported one, it uses London.

### What it costs

Orion uses the cheap DeepSeek text model, with the same key the image sorting
already uses. It only reads projects that changed, sends a short running summary
plus what's new (never whole histories), and has hard limits on how much it
reads. Expected cost: **a few cents a day, around $1 a month or less**.
DeepSeek's current prices are confirmed during the build. If DeepSeek fails, that
project gets nothing that day; there are no retry loops that burn money.

### Not in this build

- Wiring **Orchestrate** to real agents (its own spec). For now it moves the
  ticked lines to In progress, and you mark them done yourself.
- Orion starting work by itself.
- "This project has stalled" nudges for projects that went quiet.

### What "done" looks like

- At 6 am, changed projects get up to 5 sensible new to-dos each.
- Deleted to-dos never come back. Nothing on any of the three lists is duplicated.
- Todo, In progress and Completed survive quitting Orion, in the Mac app and in the browser.
- Needs you is gone from both Overviews.
- A morning with no changes costs nothing and adds nothing.

---

## Part B — Decisions made for you (and why)

| Decision | Why |
|---|---|
| Runs on the **existing Cloudflare gateway Worker** cron, changed from once a day to **hourly** (`17 * * * *`). Each tick checks whether it's 6:00–9:59 in the owner's time zone and today's run hasn't succeeded yet. | Already deployed, free, and runs while the Mac sleeps. Hourly ticks give time zone support and built-in retry. The existing Supabase keep-alive call stays in the same handler. |
| Retry window **6:00–10:00 local**. After 10:00 a missed day is skipped. | A late list at 2 pm is noise, and the next morning catches up anyway. |
| "Changed" means any new message, decision, PRD version, screen update or AI task update in the project since its `last_read_at` (first run: the last 7 days). | Cheapest possible filter. A quiet project costs $0. |
| Stage checklist items and user flows are **not** read. | Checklist definitions live in TypeScript, not the database, and user flows carry no text worth reading. Both can be added later. |
| A **running project summary** (at most ~400 words) is stored per project. DeepSeek gets summary + new facts and returns an updated summary + to-dos in one call. | Keeps input small forever. No full-history reads. |
| Caps: **10 projects per run** (most new activity first), **~6,000 words of facts per project** (newest first, older cut), **5 to-dos per project**, **1 DeepSeek call per project**, no retry on bad output. | Bounded cost. Also keeps the Worker under Cloudflare's free-plan subrequest limit (see C4). |
| The Todo is **one list of lines, each with an optional project** (the shape the Mac Overview has today). Orion appends lines at the end. | Owner: Orion writes "the way I'm writing it… then the project is selected." |
| Each line has a **stage**: `todo` → `in_progress` (Orchestrate) → `done` (marked complete). A line's tick is only a selection for Orchestrate and isn't saved. Delete marks `deleted_at`. Only `todo` lines can be edited. Completed shows the 50 most recent. | Matches the current Mac Overview (Todo / In progress / Completed). Every stage, and deleted lines, feeds the "don't suggest again" filter. |
| No visible "by Orion" mark. `author` is stored (`owner`/`orion`) for debugging only. | Owner wants Orion's lines to look like their own. |
| Duplicate check = same project + normalised text (lowercase, letters/digits/spaces only, spaces collapsed) against every line in any stage, including deleted ones. DeepSeek is also shown the Todo and In progress lines and told not to repeat them. | Code makes the hard guarantee, the prompt cuts waste. Fuzzy and semantic matching is left out (YAGNI). |
| Time zone comes from the Mac app (`TimeZone.current.identifier`) over the bridge, stored on the owner's `ai_user_preferences`. The fallback is `Europe/London`. | No question for the owner. Follows travel automatically. |
| **Needs you** UI and its query are removed from the web Overview. The activity data (`room_views`, task states) stays: the morning job reads it as facts and the sidebar hats still use it. | One place for "what to pick up" (owner rule: no duplicate signals). |
| Mac reads and writes to-dos the same way it does projects: the page includes them in the frame snapshot, and the app calls the page's handlers, which run server actions. The app picks each new line's id (a UUID), so no id mapping is needed. | "The page owns the data; the app draws it." No new sign-in or API surface. |
| All to-do reads and writes go through `security definer` functions that check workspace membership. The tables themselves are closed to `anon`/`authenticated`. | Same pattern as `room_views` / `mark_room_viewed`. The web Supabase client is untyped, so RPC + zod is the house style. |

---

## Part C — Technical design

### C1. Data (one migration)

```
todo_items
  id uuid pk, workspace_id uuid, project_id uuid null
    fk (project_id, workspace_id) -> projects(id, workspace_id) on delete set null (project_id)
  text text (1–500 chars, trimmed), author text check in ('owner','orion'),
  stage text check in ('todo','in_progress','done') default 'todo', stage_changed_at,
  position double precision, created_at, updated_at, deleted_at null
project_briefs
  project_id uuid pk -> projects on delete cascade, workspace_id uuid,
  summary text (≤ 4000 chars), last_read_at timestamptz, updated_at
morning_runs
  workspace_id uuid, local_date date, status text check in ('running','done','failed'),
  started_at, finished_at, projects_read int, items_added int,
  primary key (workspace_id, local_date)
ai_user_preferences.time_zone text null   -- IANA name, validated against pg_timezone_names
```
- Owner functions (authenticated, membership-checked): `list_todo_items` (all todo and
  in-progress lines + the 50 most recent done), `save_todo_item` (insert, or update
  text/project/position of a `todo` line, by client-chosen id), `set_todo_stage`
  (move lines between stages), `delete_todo_items` (soft delete), `set_my_time_zone`.
- Service-role functions: `list_morning_workspaces`, `claim_morning_run`,
  `morning_todo_facts`, `save_morning_todos`, `finish_morning_run`.
- `morning_runs` primary key makes "once per local day" a database guarantee. A run
  claims the day by inserting `running`, or by moving a `failed` (or a `running` that
  started over 30 minutes ago) back to `running`.

### C2. Collecting facts (one RPC, service role)

`morning_todo_facts(target_workspace_id, max_projects)` returns, for up to N changed
projects ordered by activity count: project id and name, the brief summary, `since`,
and a `facts` JSON object with what's new since `since`:
- messages (room name, `you`/`orion`, text cut to 2,000 characters, time), newest 60
- decisions (room, summary, time)
- PRD versions (room, version, status, time) and screens (room, name, state, time)
- AI tasks that failed/stuck, and tasks completed after the owner last viewed the room
- `open_todos` (display text of the project's todo and in-progress lines)
- `known_todos` (raw text of every line for the project, any stage, including deleted)

Truncation to ~6,000 words happens in TypeScript, so the RPC stays simple and the limit
is unit-testable.

### C3. The morning job (code in `apps/gateway/src/morning-todos/`, exported via `@meld/gateway/core`, called from the Worker)

```
scheduled():
  keepAlive()                                   // existing
  for each workspace from list_morning_workspaces:
    tz = time_zone ?? 'Europe/London'
    if localHour(now, tz) not in 6..9: continue
    if !claim_morning_run(workspace, localDate(now, tz)): continue
    readUntil = now
    for project in morning_todo_facts(workspace, 10):
      try:
        out = deepseek(summary + truncate(facts))  // JSON {summary, todos: string[]}
        todos = filterNew(out.todos, known_todos).slice(0, 5)
        save_morning_todos(workspace, project, out.summary, todos, readUntil)
      catch: log the project id only; last_read_at untouched (re-read tomorrow)
    finish_morning_run(status = any project failed and none saved ? failed : done, counts)
```
- Logic lives in pure modules with injected `fetch`, clock and an RPC client, the same
  shape as `deepseek-labeler.ts`. The Worker is a thin caller.
- DeepSeek: text model from `DEEPSEEK_TEXT_MODEL` (default `deepseek-flash`, as in
  `deepseek-taste-writer.ts`), `temperature: 0.2`, `response_format: json_object`, 30 s
  timeout. New Worker secret `DEEPSEEK_API_KEY`.
- The prompt says: write to-dos the way a busy founder writes their own (short,
  imperative, one action each, under 120 characters). Don't repeat the listed open
  to-dos. Return an empty list when nothing is actionable. Return a fresh summary of at
  most ~400 words.
- A project whose output has zero to-dos still gets its brief and `last_read_at` updated.
- Logs never contain message text or to-do text (the GitHub repo is public).

### C4. Limits to respect

- Cloudflare free plan subrequest cap per invocation: a run uses 1 keep-alive + 1 list +
  1 claim + 1 facts + ≤10 DeepSeek + ≤10 saves + 1 finish = ≤25. This is checked against
  current Cloudflare docs during the build. Network wait doesn't count toward CPU time.
- DeepSeek pricing is confirmed during the build and recorded in the plan's ledger.

### C5. Web

- New feature folder `apps/web/src/features/todos/`: a reader/writer over the C1 owner
  functions, server actions, and a Todo section built from Astryx (`List`, `ListItem`,
  `CheckboxInput`, `TextInput`, `DropdownMenu`, `IconButton`), with rows edge to edge and
  no Card.
- The web Todo section mirrors the Mac: Todo (editable), then In progress (each line has
  a "Mark done" button) and Completed (collapsed by default), both read-only.
- Overview page (`app/(app)/[workspaceId]/page.tsx`): remove `NeedsYouList` and
  `listAttentionItems`, add the Todo section. All projects and Starting points stay.
- Delete `needs-you-list.tsx` and its test. Delete `listAttentionItems` and the
  `features/home` attention code only if nothing else imports them.

### C6. Mac

- `FrameSnapshot` gains `todos: [FrameTodo]`. The app reports `TimeZone.current.identifier`
  through a new page handler on the first snapshot and on `NSSystemTimeZoneDidChange`.
- `OverviewTodoStore` keeps its behaviour (blank trailing line, Enter commits, project per
  line, remembered last project, Orchestrate → In progress, complete → Completed) but loads
  all three lists from the snapshot and saves through `FrameModel` → page handlers. A line
  is saved when committed (Enter) and when its project changes. Orchestrate and complete call
  `moveTodos`; delete and "remove checked" call `deleteTodos`. Local edits in
  progress are never overwritten by an incoming snapshot.

### C7. Testing

- Unit: truncation, normalise/filter, the 6–10 local window across time zones and DST,
  the 5-item cap, a fake DeepSeek returning duplicates, junk JSON and timeouts, and the run
  orchestrator with fake RPCs.
- Database (pgTAP, scratch-DB recipe): owner functions refuse non-members and anon,
  service functions refuse authenticated, once-per-day claim, facts returns only changed
  projects, and save filters nothing on its own (filtering is TypeScript's job) but
  stamps `author = 'orion'`.
- Web: reader/writer parsing, actions, the Todo section, and the Overview without Needs you.
- Mac: snapshot decode of `todos`, and store reconcile/save behaviour (Swift tests).
- Acceptance: one manual run against the owner's real projects through a local script
  (`--force` ignores the time window), checked by eye before the hourly cron is turned on.
