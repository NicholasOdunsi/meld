# Orion: Overview and the working hats

**Date:** 2026-11-09
**Status:** Design approved by the owner in brainstorm; spec awaiting owner review
**Mockups:** `.superpowers/brainstorm/89704-1794217262/content/` (overview-a-v2, mascot-motion, needs-you-jump)

---

## Read this part first (plain language)

### The problem

You work on many projects at once (Orion, Mark, Mail…), and inside each project
on several screens or flows at once. Most tools make you choose between seeing
everything (and feeling scattered) or focusing on one thing (and losing track of
the rest).

### The rule

**Many things moving, one thing in your hands.** The AI can work on several
projects at the same time. You only ever have one in front of you, and Orion
keeps track of everything else so you don't have to.

### What you'll see

**1. Overview (replaces "Home")**
- The first page you see when you open Orion.
- At the top: **Needs you**, a single list covering every project. Each item says
  what's needed and where ("Pick a login style · Mark › Onboarding") and has one
  button (Answer, Review or Fix) that takes you straight to it.
- Below that: **All projects**, one row per project with a short live status
  ("Working on Inbox screen…", "Needs you", "Last active Tuesday").

**2. The sidebar shows how each project is doing, using the hat**
- **Plain logo:** nothing is happening.
- **Hat in the project's colour, tip swaying, eyes following:** the AI is working
  on it.
- **Curious hat that hops every few seconds:** it needs you. It's still and
  looking at you between hops.
- **Hover over a curious hat** to see why ("Mark needs you · pick a login style").
- When the work is done and you've looked, the hat pops back into the logo.
- No dots, no pills, no counters. The hats carry it all.

**3. Inside a project, each flow is a tab**
- Tabs use the same hats: swaying while working, curious while waiting.
- Tab hats **don't hop**, because you're already in that project. Hopping is
  saved for "something *elsewhere* needs you."

**What counts as "needs you":** all three of these:
1. **Orion asked you something.** For example, "Shall I write the PRD?" Today these are the only questions Orion asks; new kinds plug in later.
2. **Orion finished something you haven't seen yet.** New screens, a reply, a
   user flow. This clears as soon as you open that tab.
3. **Orion got stuck.** Sign-in expired, usage limit reached, or the work failed.
   This stays until it's fixed, a new run starts, or you dismiss it from
   Overview.

**Same in the browser and the Mac app.** The Mac app draws its own sidebar and
tabs, and it gets the same hats.

### Not in this round
- Opening a project in its own window.
- Answering questions straight from the sidebar.
- A "thinking about…" line describing what the AI is doing right now. Orion
  doesn't track that yet, so the status line just names the tab being worked on.
- Changes to the rest of the project screen.

### Decisions I made for you (flagged so you can overrule them)
- **The swaying hat wins while work is running.** If one tab in a project is
  working and another needs you, the sidebar shows the swaying hat. The Overview
  list still shows the waiting item, and the tab still shows its curious hat.
  When the work stops, the sidebar hat turns curious and starts hopping.
- **"Starting points" (the quick-start cards on Home) move below All projects**
  on Overview. With no projects yet, Overview shows only the existing empty
  state.
- **Reduced motion:** if your Mac is set to reduce motion, the hats still appear
  (working hat and curious hat) but don't sway or hop.
- **Updates every few seconds.** Hats refresh about every 5 seconds while Orion
  is in front, and about every 30 seconds when it's in the background.

---

## Technical design (for implementers)

### Ground truth this builds on

- AI work lives in `public.ai_tasks` (one row per run, scoped to a room). Status
  enum `AITaskStatus` (`packages/contracts/src/ai.ts`). Active set =
  `queued | waiting_for_device | ready_to_run | running`
  (`ACTIVE_TASK_STATUSES`, `apps/web/src/features/ai/room-task-status.ts`).
- A **tab is a room**; rooms belong to a project (`rooms.project_id`).
- Agent questions are `messages.proposed_action` (kinds `prd_generate`,
  `prd_revise`). Answers are recorded in `public.message_proposal_responses`.
  The room only offers a proposal when `isProposalOffered`
  (`features/rooms/components/conversation.tsx`) says so.
- Home already has an attention pipeline: `features/home/attention/`
  (`AttentionKind` already includes `agent_run_failed`, `agent_result_review`,
  `decision_needed`; only the `mention` resolver exists) rendered by
  `features/home/components/needs-attention.tsx`.
- The web sidebar is `apps/web/src/ui/orion-sidebar.tsx`. Tabs are
  `features/projects/components/project-tabs.tsx`.
- Inside the Mac app (1.1+), the sidebar and tabs are SwiftUI
  (`apps/mac/Sources/Orion/Frame/*`), fed by `NativeFrameBridge`
  (`apps/web/src/features/native/native-frame-bridge.tsx`) through a
  `FrameSnapshot` (`features/native/bridge.ts` ↔
  `apps/mac/Sources/OrionAppCore/Frame/FrameSnapshot.swift`).
- Mascot: `apps/web/src/ui/orion-talking-hat.tsx` (`appearance="avatar"`,
  expressions `neutral | curious | speaking`).

### Unit 1: Database (migration + pgTAP)

New table `public.room_views`:

| column | type | meaning |
|---|---|---|
| `user_id` | uuid, FK auth.users | viewer |
| `room_id` | uuid, FK rooms, on delete cascade | the tab |
| `last_viewed_at` | timestamptz not null | last time the tab was opened |
| `dismissed_at` | timestamptz null | last "Dismiss" from Overview |

PK `(user_id, room_id)`. RLS: a user can only select/insert/update their own
rows, and only for rooms where `public.is_room_participant(room_id)`.

RPC `public.mark_room_viewed(target_room_id uuid)` upserts
`last_viewed_at = now()`. RPC `public.dismiss_room_attention(target_room_id uuid)`
upserts `dismissed_at = now()`. Both are `security definer`, participant-checked,
and granted to `authenticated` only.

RPC `public.list_workspace_activity(target_workspace_id uuid)` returns one row
per room the caller participates in:

```
room_id uuid, project_id uuid, room_name text,
state text          -- 'idle' | 'working' | 'needs_you'
reason text         -- null | 'asked' | 'finished' | 'stuck'
task_kind ai_task_kind null, task_status ai_task_status null,
provider ai_provider null,
occurred_at timestamptz null   -- when the reason happened
last_activity_at timestamptz null
```

State rules, evaluated per room in this order:
1. **working**: any task in the active set exists → `state='working'`,
   `reason=null`.
2. **stuck**: the newest task by `updated_at` has status in
   `failed | needs_reauthentication | usage_limit_reached | needs_review`
   and `updated_at > coalesce(dismissed_at, '-infinity')` →
   `needs_you / stuck`.
3. **asked**: the newest agent message with a non-null `proposed_action` has no
   row in `message_proposal_responses`, its `created_at >
   coalesce(dismissed_at, '-infinity')`, and it is still *offered* by the same
   rules as `isProposalOffered`: `prd_generate` only while the room has no PRD;
   `prd_revise` only while the room has a PRD and the message has an
   `ai_task_id`. ("PRD task settled" is already guaranteed because rule 1 didn't
   match.) → `needs_you / asked`.
4. **finished**: the newest task has status `completed` and
   `updated_at > coalesce(last_viewed_at, '-infinity')` → `needs_you / finished`.
5. Otherwise `idle`.

If `isProposalOffered` ever changes, rule 3 must change with it. Otherwise the
hat would ask a question the room doesn't show. Add a comment in both places
pointing at the other. pgTAP covers every rule, their precedence, participant
scoping, and the cascade on room delete.

Add `WorkspaceActivity` (zod schema + type) to `packages/contracts`.

### Unit 2: The hat mark (web)

`apps/web/src/ui/orion-hat-mark.tsx` → `<OrionHatMark state color size
hop label />`
- `state: 'working' | 'needs_you'`; `color`: a project colour CSS var;
  `hop: boolean` (sidebar true, tabs false).
- Renders `OrionTalkingHat appearance="avatar"` (expression `neutral` for
  working, `curious` for needs-you). This needs two small additions to that
  component: (a) wrap each iris, pupil and catchlight in a `data-part="look"`
  group so the gaze can be animated, and (b) an optional `tint` prop that lays a
  `mix-blend-mode: color` fill over the crown and brim clip paths. Both are
  proven in the brainstorm mockup.
- Motion (CSS keyframes, values from `mascot-motion.html` /
  `needs-you-jump.html`):
  - working: `skewX(5deg → -6deg)` about the base (origin 50% 95%), 2.8s
    ease-in-out loop; eyes translate ±6 units in sync.
  - needs-you + hop: squash → leap 38% → land squash in the first 10% of a 6s
    loop. Blink every ~5s. Multiple hats get staggered start offsets so they
    don't hop in unison.
  - idle → hat: tile scales out, hat springs in (cubic-bezier(.3,1.5,.5,1),
    ~450ms). Hat → idle: pop (scale .55 → 1, 500ms).
  - `prefers-reduced-motion: reduce` turns off sway, hop, blink and transitions.
- Accessibility: `role="img"` with `aria-label`, e.g. "Mark: needs you, pick a
  login style" or "Orion: working". The hover tooltip uses the Astryx
  `Tooltip`.
- Astryx rules apply: no raw `div`/hex/px. Colours come from
  `PROJECT_COLOR_VARS`, sizes from tokens.

### Unit 3: Activity reader + live hook (web)

- `features/activity/activity-reader.ts`: calls `list_workspace_activity`,
  parses with the contracts schema, and derives per-project state using the rule
  **working > needs_you > idle** across the project's rooms. For a project's
  `needs_you`, the reason shown is the most recent one.
- `features/activity/use-workspace-activity.ts`: a client hook that polls every
  5s while `document.visibilityState === 'visible'` and every 30s otherwise,
  keeps the last good value on error, and exposes `{byProject, byRoom}`.
- `features/activity/describe.ts` is the single source of the wording used in
  tooltips, Overview rows and accessible labels:

| reason / kind | title | button |
|---|---|---|
| asked · prd_generate | "Write the PRD?" | Answer |
| asked · prd_revise | "Update the PRD?" | Answer |
| finished · design_screen_generate | "New screens are ready" | Review |
| finished · user_flow_generate | "User flow is ready" | Review |
| finished · prd_* | "PRD is ready" | Review |
| finished · room_reply / other | "Orion replied" | Review |
| stuck · needs_reauthentication | "Sign in to {provider} again" | Fix |
| stuck · usage_limit_reached | "{provider} usage limit reached" | Fix |
| stuck · needs_review | "A result needs a look" | Review |
| stuck · failed | "Something went wrong" | Fix |

### Unit 4: Sidebar + tabs (web)

- `OrionSidebar`: rename "Home" to **Overview** (same route `/${workspaceId}`).
  The project icon slot renders `OrionHatMark` when the project is `working` or
  `needs_you` (with `hop`), otherwise the existing pixel glyph. Tooltip on
  needs-you shows `"{Project} needs you · {title}"`.
- `ProjectTabs`: the same per room, without `hop`.
- The Taste dot stays as it is (Taste isn't a project).

### Unit 5: Mark viewed

The room page calls `mark_room_viewed` on mount and again whenever a task in
that room transitions to `completed` while the room is open, so finished work
you're watching never shows as unseen.

### Unit 6: Overview page (web)

`app/(app)/[workspaceId]/page.tsx`:
- Heading: a time-of-day greeting plus a one-line summary ("4 projects · 2
  working · 3 need you").
- **Needs you**: extend the existing attention registry with an
  `activityResolver` that maps `needs_you` rooms to `AttentionItem`s, using kinds
  `decision_needed` (asked), `agent_result_review` (finished) and
  `agent_run_failed` (stuck). Rename the section to "Needs you". Each row shows
  the hat (no hop), the title, "Project › Tab", a relative time, and the primary
  button (links to the room). Stuck and asked rows also get **Dismiss** →
  `dismiss_room_attention`. Existing mention items keep working.
- **All projects**: an Astryx `List` row per project with the glyph or hat, the
  name, the tab count, and a status line (`Working on {tab}…` / the needs-you
  title / `Last active {relative}`), linking to the project.
- **Starting points** below. With zero projects, show only
  `NoProjectsEmptyState`.
- The page uses the live hook, so rows update without a reload.

### Unit 7: Mac app

- Extend `FrameSnapshot` (TS + Swift) with
  `activity: [{ projectId, roomId, state, reason, title }]`. `NativeFrameBridge`
  re-posts the snapshot when the activity changes (it already re-posts on
  path/project changes).
- `apps/mac/Sources/Orion/Frame/HatMark.swift`: a SwiftUI view drawing the hat
  from layered vector assets exported from the avatar SVG (`hat-body`,
  `hat-eyes-neutral`, `hat-eyes-curious`; PDF with "Preserve Vector Data").
  Tint the body with the project's `ProjectStyle` colour (desaturate, then a
  colour-blend overlay). Animate sway with a skew `ProjectionTransform` about
  the base, the eyes with an offset, and the hop with an offset plus scale,
  using the same timings as the web. Respect
  `accessibilityReduceMotion`.
- `SidebarRow` / `ProjectMark` show `HatMark` (hop on). `ProjectTabBar` shows it
  with hop off. `.help()` gives the tooltip text. The "Home" destination label
  becomes "Overview".
- Swift work follows `.claude/skills/swiftui-pro`.

### Delivery order (subagent-driven)

| Step | Units | Can run in parallel with |
|---|---|---|
| A | 1 Database + contracts | B |
| B | 2 Hat mark (web) + export layered assets for Mac | A |
| C | 3 Activity reader + hook + wording | after A |
| D | 4 Sidebar + tabs, 5 Mark viewed | after B, C; parallel with E |
| E | 6 Overview page | after B, C; parallel with D |
| F | 7 Mac app | after B, C (assets + snapshot) |

### Testing

- pgTAP: every state rule, their precedence, `last_viewed_at` / `dismissed_at`
  clearing, participant isolation, cascade on room delete.
- Vitest: activity reader (project roll-up precedence), describe table,
  hook polling/visibility/error retention (fake timers), `OrionHatMark` states +
  aria labels + reduced motion, sidebar/tab rendering per state, Overview
  sections + Dismiss + empty state, `mark_room_viewed` call on room mount.
- Swift: `FrameSnapshot` decoding of `activity`, `FrameModel` mapping to row
  state, `HatMark` state → expression/animation selection.
- Manual acceptance in the Mac app and the browser: start a screen generation in
  project A while viewing project B. A's hat sways, then turns curious and hops
  when the generation finishes. Opening A's tab returns it to the logo.

### Acceptance

1. Overview replaces Home: the Needs you list across all projects is on top,
   with All projects below.
2. Sidebar project marks: logo when idle, swaying tinted hat while working,
   curious hopping hat when it needs you, with a tooltip giving the reason.
3. Tabs show the same hats, without the hop.
4. All three reasons (asked, finished, stuck) appear. Finished clears on opening
   the tab. Stuck/asked clear when resolved or dismissed.
5. Browser and Mac app behave the same.
6. Reduced motion is respected. Hats have accessible labels.
7. Web typecheck, lint, Vitest, pgTAP and Swift tests pass.
