# Orion: morning to-dos

Status: design agreed in brainstorm 2026-11-09 · spec awaiting owner review · Owner: Nicholas Odunsi
Builds on: `2026-11-09-orion-app-structure-design.md` (native frame + bridge) and the
native Overview (quote · Connected agents · Todo) on branch `NicholasOdunsi/orion-app-structure`.
Replaces: the "Needs you" list from `2026-11-09-orion-overview-and-working-hats-design.md`.

---

## Part A — Read this first (plain language)

### What this is

Every morning at **6:00 am your time**, Orion goes through your projects and
writes the things you should pick up into the **Todo** section on the
Overview. Those lists look exactly like the ones you write yourself: a title,
the project picked, and plain items like "Update the user flow for sign-up".
If one isn't useful, delete it like anything else.

### What changes on the Overview

- **Needs you is removed** everywhere, in the Mac app and in the browser.
  The morning to-dos take its place.
- **Todo is saved.** Today your lists disappear when Orion quits. After this,
  they're saved online, so they survive restarts and Orion can add to them.
- The browser Overview gets the same Todo section. All projects stays.
- The Mac Overview keeps its quote and Connected agents sections.

### What Orion reads

Only projects that **changed since the last morning run**. Projects that didn't
change are skipped. For each changed project it looks at:

- the chats in every tab: what you said, what the AI said, anything left hanging
- the PRD, user flows and screens, to see what's planned versus what exists
- open decisions and unfinished stage checklist items
- AI work that failed, got stuck, or finished without you opening it

### What Orion writes

- New lists in Todo, each with a short title and the project picked. A project
  can have several lists (for example "Onboarding follow-ups" and "Pricing").
- At most **5 new items per project per morning**.
- Nothing marks an item as Orion's. It looks like yours.

### What Orion never does

- Re-add an item you deleted before.
- Add an item that's already open in any list.
- Change or add to lists you wrote. It only creates new lists.
- Start any AI work. Sending to an agent stays your click.

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

- Wiring up **Send to agent** (its own spec).
- Orion starting work by itself.
- "This project has stalled" nudges for projects that went quiet.

### What "done" looks like

- At 6 am, changed projects get new Todo lists with up to 5 sensible items each.
- Deleted items never come back. Open items are never duplicated.
- Your own lists survive quitting Orion, in the Mac app and in the browser.
- Needs you is gone from both Overviews.
- A morning with no changes costs nothing and adds nothing.

---

## Part B — Decisions made for you (and why)

| Decision | Why |
|---|---|
| Runs on the **existing Cloudflare gateway Worker** cron, changed from once a day to **hourly** (`17 * * * *`). Each tick checks whether it's past 6:00 in the owner's time zone and today's run hasn't succeeded yet. | Already deployed, free, and runs while the Mac sleeps. Hourly ticks give time zone support and built-in retry. The existing Supabase keep-alive call stays in the same handler. |
| Retry window **6:00–10:00 local**. After 10:00 a missed day is skipped. | A late list at 2 pm is noise, and the next morning catches up anyway. |
| "Changed" means any new message, decision, checklist change, PRD/user-flow/screen version or AI task event in the project since `last_read_at`. | Cheapest possible filter. A quiet project costs $0. |
| A **running project summary** (at most ~400 words) is stored per project. DeepSeek gets summary + new facts and returns an updated summary + to-dos in one call. | Keeps input small forever. No full-history reads. |
| Caps: **10 projects per run** (most new activity first), **~6,000 words of facts per project** (newest first, older cut), **5 items per project**, **1 DeepSeek call per project**, no retry on bad output. | Bounded cost. Also keeps the Worker under Cloudflare free-plan subrequest limits (see C4). |
| **Orion makes new lists only**, never edits yours. It may make several lists per project. | Owner: "we can have multiple lists per project, doesn't change anything." It also avoids ever clobbering the owner's work. |
| No visible "by Orion" mark. `author` is stored (`owner`/`orion`) for filtering and debugging only. | Owner wants Orion's items to look like their own. |
| Deleting an item **soft-deletes** it (`deleted_at`). Deleted and done items feed the "don't suggest again" filter. | That's the only way to honour "deleted means gone". |
| Duplicate check = same project + normalised text (lowercase, trimmed, punctuation stripped) against open, done and deleted items, plus DeepSeek is shown the open items and told not to repeat them. | Code makes the hard guarantee, the prompt cuts waste. Fuzzy and semantic matching is left out (YAGNI). |
| Time zone comes from the Mac app (`TimeZone.current.identifier`) over the bridge, stored on the owner's preferences. The fallback is `Europe/London`. | No question for the owner. Follows travel automatically. |
| **Needs you** UI and its query are removed from the web Overview. The attention data (`room_views`, task states) stays because the morning job reads it as facts, and the sidebar hats still use it. | One place for "what to pick up" (owner rule: no duplicate signals). |
| Mac reads and writes to-dos the same way it does projects: the page includes them in the frame snapshot, and the app calls the page's server actions over the bridge. | "The page owns the data; the app draws it." No new sign-in or API surface. |

---

## Part C — Technical design

### C1. Data (one migration)

```
todo_lists
  id uuid pk, workspace_id uuid fk, project_id uuid null fk (on delete set null),
  title text, author text check in ('owner','orion'), position int,
  created_at, deleted_at null
todo_items
  id uuid pk, list_id uuid fk (cascade), workspace_id uuid fk,
  project_id uuid null  -- copied from the list at insert time, for the dedupe filter
  text text, normalized_text text, done_at null, deleted_at null,
  author text check in ('owner','orion'), position int, created_at
project_briefs
  project_id uuid pk fk (cascade), workspace_id uuid fk,
  summary text, last_read_at timestamptz, updated_at
morning_runs
  workspace_id uuid, local_date date, status text check in ('running','done','failed'),
  started_at, finished_at, projects_read int, items_added int,
  primary key (workspace_id, local_date)
```
- Owner time zone: new column `ai_user_preferences.time_zone text` (IANA name, nullable).
- RLS: workspace members can select/insert/update their workspace's `todo_lists` and
  `todo_items`. `project_briefs` and `morning_runs` are service_role only.
- Indexes: `todo_items (workspace_id, project_id, normalized_text)`, `todo_lists (workspace_id, deleted_at)`.
- `morning_runs` primary key makes "once per local day" a database guarantee. The run
  claims the day with an insert of `running`, or by moving `failed` to `running`.

### C2. Collecting facts (one RPC, service role)

`morning_todo_facts(p_workspace_id, p_limit_projects int)` returns, for up to N changed
projects ordered by activity count: project name, the brief summary, and new items since
`last_read_at`:
- messages (role, room name, text, time), newest first
- decisions (status open), checklist items not done
- PRD / user-flow / screen version events (title only)
- AI tasks failed/stuck, and finished tasks whose room wasn't viewed after they finished
- open to-do item texts for that project (for the prompt)

Truncation to ~6,000 words per project happens in TypeScript. That way the RPC stays
simple and the limit is unit-testable.

### C3. The morning job (code in `apps/gateway/src/morning-todos/`, exported via `@meld/gateway/core`, called from the Worker)

```
scheduled():
  keepAlive()                       // existing
  for each workspace with an owner:  // single user today
    tz = prefs.time_zone ?? 'Europe/London'
    if localHour(tz) < 6 or >= 10: continue
    if !claimRun(workspace, localDate(tz)): continue
    facts = morning_todo_facts(workspace, 10)
    for project in facts:
      try:
        out = deepseek(summary + truncate(facts))   // JSON: {summary, lists:[{title, items[]}]}
        validate with zod; cap 5 items total; drop dupes/deleted (normalized_text)
        save_morning_todos(project, out)             // RPC: insert lists+items, upsert brief, bump last_read_at
      catch: log, leave last_read_at untouched (facts retried tomorrow)
    finishRun(status, counts)
```
- Logic lives in a pure module (`morning-todos/`) with injected `fetch`, clock and
  Supabase client, the same shape as `deepseek-labeler.ts`. The Worker is a thin caller.
- DeepSeek: text model from `DEEPSEEK_TEXT_MODEL` (default as in `deepseek-taste-writer.ts`),
  `temperature: 0.2`, `response_format: json_object`, 30 s timeout. New Worker secret
  `DEEPSEEK_API_KEY`.
- The prompt says: write items the way a busy founder writes their own to-dos (short,
  imperative, one action each). Don't repeat the listed open items. Return nothing for
  a project with nothing actionable. Return a fresh summary of at most ~400 words.
- A project whose output has zero items still gets its brief and `last_read_at` updated.

### C4. Limits to respect

- Cloudflare free plan: the subrequest cap per invocation. Per run that's 1 claim + 1 facts RPC +
  ≤10 DeepSeek + ≤10 save RPCs + 1 finish ≈ 23. Stay under the plan cap, checked
  against current Cloudflare docs during the build. Network wait doesn't count toward CPU time.
- DeepSeek pricing is confirmed during the build and recorded in the plan.

### C5. Web

- New feature folder `apps/web/src/features/todos/`: queries, server actions
  (create/rename/delete list, set project, add/toggle/delete item), and a Todo section
  component built from Astryx (List/Item, no Card-wrapped rows).
- Overview page (`app/(app)/[workspaceId]/page.tsx`): remove `NeedsYouList` and
  `listAttentionItems`, add the Todo section. All projects and Starting points stay.
- Delete `needs-you-list.tsx` and its test, plus the attention query once nothing else
  uses it (the hats' data path stays).

### C6. Mac

- `FrameSnapshot` gains `todos: [TodoList]` and `timeZone` reporting (app → page on
  launch and on `NSSystemTimeZoneDidChange`).
- `OverviewTodoStore` stops being in-memory: it reads lists from the snapshot and sends
  bridge actions (`todo.addList`, `todo.addItem`, `todo.toggle`, `todo.delete`, …) that
  call the C5 server actions. Optimistic local update, reconciled by the next snapshot.
- The "Send to agent" button stays as it is now (not wired).

### C7. Testing

- Unit: truncation, normalise/dedupe/deleted filter, 6–10 local window across time
  zones and DST, item cap, JSON validation with a fake DeepSeek returning duplicates,
  junk and timeouts.
- Database (pgTAP, scratch-DB recipe): RLS on to-do tables, service-role-only briefs/runs,
  once-per-day claim, the facts RPC returns only changed projects.
- Web: Todo section actions and Overview without Needs you.
- Mac: `OverviewTodoStore` snapshot decode + action encoding (Swift tests).
- Acceptance: one manual run against the owner's real projects (a dev trigger route,
  owner-only) and an eyeball check before the hourly cron is turned on.
