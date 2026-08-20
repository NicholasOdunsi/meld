# Workspace Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the workspace landing page with the Deck — a framed plane
carrying a pending-work ticket on the left, project tiles down the right edge,
and a prompt at the bottom — with no sidebar.

**Architecture:** New presentational primitives live in `apps/web/src/ui/meld/`
(the only directory allowed raw elements and, for `tokens.css`, raw values).
Feature components in `apps/web/src/features/home/components/` compose them.
Pending rows come from the existing `features/home/attention/` resolver registry —
this adds resolvers, it does not build a system. The sidebar shell moves *down*
from `[workspaceId]/layout.tsx` into the sub-routes that want it, because a Next
child route cannot opt out of a parent layout.

**Tech Stack:** Next.js App Router (server components), TypeScript, CSS Modules,
vitest + @testing-library/react (jsdom), Playwright, Supabase JS (reads only).

**Design doc:** `docs/superpowers/specs/2026-08-20-workspace-deck-design.md`

## Verified facts that override the design doc

Checked against the codebase while writing this plan. The design doc assumed
routes that do not exist; **these are the real behaviours to build.**

1. **There is no project page.** `apps/web/src/app/(app)/[workspaceId]/`
   contains only `design-system/`, `rooms/`, `settings/`. So a tile links to
   **the project's most recently active room**
   (`/{workspaceId}/rooms/{roomId}`). A project with no rooms is not a link —
   it opens the start-room dialog. When the project page is built, one line in
   `project-column.tsx` changes.
2. **Projects and rooms are created by dialogs, not routes.**
   `CreateProjectDialog({ workspaceId, isOpen, onOpenChange })` already exists
   in `features/projects/components/create-project-dialog.tsx`. So `⌘N` opens
   that dialog; it does not navigate.
3. **There is no "scratch room" concept.** Creating a room goes through
   `createRoomFromBrief` and needs a `projectId` — see
   `features/home/components/use-starting-point-actions.ts`. **`⇧⌘N` is
   therefore out of scope for this plan.** The shortcut line advertises `⌘N`
   and `⌘K` only. Do not invent a scratch room.
4. **`ui/meld/stack.tsx` has no `MeldHStack`/`MeldVStack`.** It exports
   `MeldStack` (vertical, `gap` 2–6 only), plus `MeldActions`,
   `MeldCenteredActions` (horizontal, centred), `MeldControlRow`, `MeldCard`
   and friends. Use `MeldStack` for columns and `MeldCenteredActions` for the
   sprite row. Any other layout needs a new primitive in `ui/meld/` with its
   own test — never a raw `<div>` in feature code.
5. **`[workspaceId]/layout.tsx` has a colocated `layout.test.tsx`.** Deleting
   the layout means moving that test to cover
   `features/workspaces/workspace-shell-layout.tsx` instead. Leaving an orphan
   test file fails `pnpm check:test-colocation`.

## Global Constraints

- **Backend is off limits.** No migrations, no new tables, no RLS changes, no
  writes, no new server actions. `apps/web/src/` only. Every added query is a
  server-side read running as the signed-in user.
- **Pending actions navigate, never write.** Ticket actions are `next/link`
  navigations into the room that owns the work.
- **Raw `<div>` and `<span>` are banned outside `apps/web/src/ui/meld/`.**
  Enforced by `scripts/check-astryx-conventions.mjs`. Feature code composes
  primitives. `<Link>` and other components are fine anywhere.
- **Literal hex colours and `px` values are banned outside
  `apps/web/src/ui/meld/tokens.css`** — in `.ts`, `.tsx` *and* `.css`. Every
  dimension in a new `.module.css` must be `var(--meld-*)`. Add the token to
  `tokens.css` first.
- **Tokens are namespaced `--meld-*`.** Never override `--color-*` /
  `--spacing-*`; Astryx still owns those for 100+ unmigrated files.
- **Pixel corners via `clip-path: var(--meld-pixel-corner)`.** `clip-path`
  destroys `outline`, so focus rings are `inset box-shadow`.
- **Typography:** Archivo for all body copy. `var(--meld-font-pixel)` (Pixelify
  Sans) only for labels, chips, counts, sources, ages, barcode. Never body copy,
  never titles.
- **Variants are reflected as `data-*` attributes.** Hashed CSS-module class
  names cannot be targeted from a test; `data-*` is part of the contract.
- **Every animation sits behind `@media (prefers-reduced-motion: reduce)`.**
- **Tests are colocated** (`foo.tsx` + `foo.test.tsx`), enforced by
  `scripts/check-test-colocation.mjs`.
- **Component registry:** adding or altering a component in `ui/meld/` means
  updating `apps/web/src/ui/meld/COMPONENTS.md` **in the same commit**.

**Commands** (from repo root):

| Purpose | Command |
| --- | --- |
| One test file | `pnpm --filter @meld/web exec vitest run <path>` |
| All web tests | `pnpm --filter @meld/web test` |
| Conventions | `pnpm check:astryx` |
| Colocation | `pnpm check:test-colocation` |
| Types | `pnpm --filter @meld/web typecheck` |
| E2E | `pnpm test:e2e` |

---

## File Structure

**Created — `apps/web/src/ui/meld/`** (primitives; raw elements allowed):

| File | Responsibility |
| --- | --- |
| `deck-frame.tsx` + `.module.css` | The framed plane and its dot field |
| `watermark.tsx` + `.module.css` | Ghosted wordmark + workspace name |
| `kind-chip.tsx` + `.module.css` | Pixelify chip for the four pending kinds |
| `ticket-row.tsx` + `.module.css` | One pending row: chip, source, age, ask, actions |
| `ticket.tsx` + `.module.css` | Torn dark paper shell: header, rules, barcode |
| `agent-sprite.tsx` + `.module.css` | Pixel character with `working/waiting/idle` |
| `peek-card.tsx` + `.module.css` | Rotated preview card behind a tile |
| `project-tile.tsx` + `.module.css` | Dark tile, colour glow, LIVE / unread badge |

**Created — `apps/web/src/features/home/`:**

| File | Responsibility |
| --- | --- |
| `attention/idle-room-resolver.ts` | `room_idle` rows, computed from rooms already fetched |
| `attention/agent-task-resolver.ts` | `approval_request` + `agent_run_failed` from `ai_tasks` |
| `agent-presence.ts` | Is any agent task running in this workspace |
| `components/pending-ticket.tsx` | Ticket + rows + sprites |
| `components/project-column.tsx` | Column of tiles + new-project affordance |
| `components/deck-prompt.tsx` | The prompt input |
| `components/shortcut-line.tsx` | ⌘N / ⌘K line |
| `components/deck-shortcuts.tsx` | Client component binding the keys |
| `components/deck.tsx` | Composition of the whole surface |

**Created — `apps/web/src/features/workspaces/`:**

| File | Responsibility |
| --- | --- |
| `require-workspace-access.ts` | The single auth + membership guard |
| `workspace-shell-layout.tsx` | `AppFrame` + `WorkspaceNavigation`, for sub-routes |

**Modified:**

- `apps/web/src/ui/meld/tokens.css` — deck tokens
- `apps/web/src/ui/meld/COMPONENTS.md` — registry entries
- `apps/web/src/features/home/attention/types.ts` — `room_idle` kind, 3 optional fields
- `apps/web/src/features/home/actions.ts` — `listPendingItems`
- `apps/web/src/app/(app)/[workspaceId]/page.tsx` — renders the Deck
- **Deleted:** `apps/web/src/app/(app)/[workspaceId]/layout.tsx`
- **Created:** `rooms/layout.tsx`, `settings/layout.tsx`, `design-system/layout.tsx`

---

### Task 1: Deck tokens, frame and watermark

**Files:**
- Modify: `apps/web/src/ui/meld/tokens.css`
- Create: `apps/web/src/ui/meld/deck-frame.tsx`, `deck-frame.module.css`, `deck-frame.test.tsx`
- Create: `apps/web/src/ui/meld/watermark.tsx`, `watermark.module.css`, `watermark.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `MeldDeckFrame({ children }: { children: ReactNode })`,
  `MeldWatermark({ workspaceName }: { workspaceName: string })`, and the
  `--meld-deck-*` token set every later task depends on.

- [ ] **Step 1: Add the deck tokens**

Append inside the existing `:root` block in `apps/web/src/ui/meld/tokens.css`,
after the `--meld-pixel-field-height` declaration:

```css
  /* ---- The Deck ------------------------------------------------------
   * The workspace landing surface. Sizes are fixed rather than fluid: the
   * deck is a composed plane, not a flow layout, and the ticket and the
   * project column both need to land on the 24px dot grid. */
  --meld-deck-grid: 24px;
  --meld-deck-frame-inset: 24px;
  --meld-deck-gutter: 48px;
  --meld-deck-ticket-width: 316px;
  --meld-deck-column-width: 172px;
  --meld-deck-tile-height: 92px;
  --meld-deck-peek-width: 62px;
  --meld-deck-peek-height: 44px;
  --meld-deck-prompt-width: 420px;
  --meld-deck-sprite-height: 40px;
  --meld-deck-tear: 12px;
  --meld-deck-tear-radius: 7px;

  /* The ticket is the one dark block on the page. It carries its own
   * ink-on-dark scale because the light-mode text tokens are unreadable
   * on it. */
  --meld-deck-paper: #1a0d16;
  --meld-deck-paper-text: #ffffff;
  --meld-deck-paper-muted: #6b5561;
  --meld-deck-paper-rule: #4a3641;
  --meld-deck-paper-line: #2b1a25;

  /* Ghosted through the middle of the deck. Deliberately near-invisible:
   * it is orientation, not content. */
  --meld-deck-watermark: rgba(26, 13, 22, 0.07);
  --meld-deck-watermark-sub: rgba(26, 13, 22, 0.11);
  --meld-deck-watermark-size: 132px;
  --meld-deck-watermark-sub-size: 26px;
  --meld-deck-field-dot: 1.2px;
  --meld-deck-field-opacity: 0.1;
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/ui/meld/deck-frame.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldDeckFrame } from "./deck-frame";

afterEach(cleanup);

it("renders its children", () => {
  render(<MeldDeckFrame>{"Ticket"}</MeldDeckFrame>);

  expect(screen.getByText("Ticket")).toBeInTheDocument();
});

it("exposes the plane for stable targeting", () => {
  render(<MeldDeckFrame>{"Ticket"}</MeldDeckFrame>);

  expect(screen.getByTestId("deck-frame")).toBeInTheDocument();
});
```

`apps/web/src/ui/meld/watermark.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldWatermark } from "./watermark";

afterEach(cleanup);

it("shows the workspace name", () => {
  render(<MeldWatermark workspaceName="Nicholas' Studio" />);

  expect(screen.getByText("Nicholas' Studio")).toBeInTheDocument();
});

it("is hidden from assistive technology", () => {
  render(<MeldWatermark workspaceName="Nicholas' Studio" />);

  expect(screen.getByTestId("deck-watermark")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/deck-frame.test.tsx src/ui/meld/watermark.test.tsx`
Expected: FAIL — "Failed to resolve import ./deck-frame".

- [ ] **Step 4: Write the implementations**

`apps/web/src/ui/meld/deck-frame.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./deck-frame.module.css";

export type MeldDeckFrameProps = {
  children: ReactNode;
};

/**
 * The deck's plane: a dot field with a single hairline frame inset from the
 * viewport edge. Purely a container -- every region inside it positions
 * itself against the 24px grid the field draws.
 */
export function MeldDeckFrame({ children }: MeldDeckFrameProps) {
  return (
    <div className={styles.plane} data-testid="deck-frame">
      <div className={styles.field} aria-hidden />
      <div className={styles.frame} aria-hidden />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
```

`apps/web/src/ui/meld/deck-frame.module.css`:

```css
.plane {
  position: relative;
  min-height: 100dvh;
  background-color: var(--meld-surface-wash);
  overflow: hidden;
}

.field {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
    var(--meld-text) var(--meld-deck-field-dot),
    transparent var(--meld-deck-field-dot)
  );
  background-size: var(--meld-deck-grid) var(--meld-deck-grid);
  opacity: var(--meld-deck-field-opacity);
}

.frame {
  position: absolute;
  inset: var(--meld-deck-frame-inset);
  border: var(--meld-hairline) solid var(--meld-line-strong);
}

.content {
  position: relative;
  height: 100%;
}
```

`apps/web/src/ui/meld/watermark.tsx`:

```tsx
import styles from "./watermark.module.css";

export type MeldWatermarkProps = {
  workspaceName: string;
};

/**
 * The wordmark ghosted through the middle of the deck. `aria-hidden` because
 * the workspace name is already announced by the top strip -- repeating it
 * would be noise, and the mark itself carries no information.
 */
export function MeldWatermark({ workspaceName }: MeldWatermarkProps) {
  return (
    <div className={styles.mark} data-testid="deck-watermark" aria-hidden="true">
      <div className={styles.word}>MELD</div>
      <div className={styles.sub}>{workspaceName}</div>
    </div>
  );
}
```

`apps/web/src/ui/meld/watermark.module.css`:

```css
.mark {
  text-align: center;
  pointer-events: none;
  user-select: none;
}

.word {
  font-size: var(--meld-deck-watermark-size);
  font-weight: var(--meld-weight-bold);
  letter-spacing: var(--meld-tracking-tight);
  line-height: 1;
  color: var(--meld-deck-watermark);
}

.sub {
  font-size: var(--meld-deck-watermark-sub-size);
  letter-spacing: var(--meld-tracking-tight);
  color: var(--meld-deck-watermark-sub);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/deck-frame.test.tsx src/ui/meld/watermark.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the conventions check**

Run: `pnpm check:astryx`
Expected: exit 0. If it reports "hardcoded pixel" or "hardcoded color", the
value belongs in `tokens.css` — move it and reference it with `var()`.

- [ ] **Step 7: Register the components**

Add to `apps/web/src/ui/meld/COMPONENTS.md`, following the existing entry format
(heading, one-paragraph rationale, prop table):

```markdown
### `MeldDeckFrame` — `deck-frame.tsx`

The workspace deck's plane: a dot field on the 24px grid with a single hairline
frame inset from the edge. A container only — regions position themselves
against the grid rather than flowing.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | The deck's regions. |

### `MeldWatermark` — `watermark.tsx`

The wordmark ghosted through the middle of the deck. `aria-hidden`: the top
strip already announces the workspace name.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `workspaceName` | `string` | — | Rendered under the mark. |
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/ui/meld/tokens.css apps/web/src/ui/meld/deck-frame.* apps/web/src/ui/meld/watermark.* apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): deck plane, watermark and deck tokens"
```

---

### Task 2: Pending kind chip

**Files:**
- Create: `apps/web/src/ui/meld/kind-chip.tsx`, `kind-chip.module.css`, `kind-chip.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: deck tokens from Task 1.
- Produces: `export type MeldPendingKind = "review" | "approve" | "failed" | "stale"`
  and `MeldKindChip({ kind }: { kind: MeldPendingKind })`. Every later task
  imports `MeldPendingKind` from this file.

- [ ] **Step 1: Write the failing test**

`apps/web/src/ui/meld/kind-chip.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldKindChip } from "./kind-chip";

afterEach(cleanup);

it("prints the kind in upper case", () => {
  render(<MeldKindChip kind="approve" />);

  expect(screen.getByText("APPROVE")).toBeInTheDocument();
});

it("reflects the kind for stable targeting", () => {
  render(<MeldKindChip kind="stale" />);

  expect(screen.getByText("STALE")).toHaveAttribute("data-kind", "stale");
});

it("labels a failed run", () => {
  render(<MeldKindChip kind="failed" />);

  expect(screen.getByText("FAILED")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/kind-chip.test.tsx`
Expected: FAIL — "Failed to resolve import ./kind-chip".

- [ ] **Step 3: Write the implementation**

`apps/web/src/ui/meld/kind-chip.tsx`:

```tsx
import styles from "./kind-chip.module.css";

export type MeldPendingKind = "review" | "approve" | "failed" | "stale";

const LABELS: Record<MeldPendingKind, string> = {
  review: "REVIEW",
  approve: "APPROVE",
  failed: "FAILED",
  stale: "STALE",
};

export type MeldKindChipProps = {
  kind: MeldPendingKind;
};

/**
 * The stamped kind on a pending row. Pixelify Sans is correct here -- this is
 * metadata, not copy -- and the colour is doing the sorting, so the label
 * stays a single word.
 */
export function MeldKindChip({ kind }: MeldKindChipProps) {
  return (
    <span className={styles.chip} data-kind={kind}>
      {LABELS[kind]}
    </span>
  );
}
```

`apps/web/src/ui/meld/kind-chip.module.css`:

```css
.chip {
  display: inline-block;
  font-family: var(--meld-font-pixel);
  font-size: var(--meld-text-xs);
  letter-spacing: 0.12em;
  padding: 0 var(--meld-space-1);
  clip-path: var(--meld-pixel-corner);
}

.chip[data-kind="review"] {
  background-color: var(--meld-sky);
  color: var(--meld-text-on-sky);
}

.chip[data-kind="approve"] {
  background-color: var(--meld-green);
  color: var(--meld-text-on-green);
}

.chip[data-kind="failed"] {
  background-color: var(--meld-red);
  color: var(--meld-white);
}

.chip[data-kind="stale"] {
  background-color: var(--meld-yellow);
  color: var(--meld-text);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/kind-chip.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Register and commit**

Add a `### MeldKindChip — kind-chip.tsx` entry to `COMPONENTS.md` with the prop
table (`kind: MeldPendingKind`, required, reflects `data-kind`), then:

```bash
pnpm check:astryx
git add apps/web/src/ui/meld/kind-chip.* apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): pending kind chip"
```

---

### Task 3: Ticket row

**Files:**
- Create: `apps/web/src/ui/meld/ticket-row.tsx`, `ticket-row.module.css`, `ticket-row.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: `MeldKindChip`, `MeldPendingKind` (Task 2).
- Produces: `MeldTicketRow({ kind, source, age, ask, children })`. `children` is
  the action slot — callers pass `<Link>`s, never buttons, because the deck
  never writes.

- [ ] **Step 1: Write the failing test**

`apps/web/src/ui/meld/ticket-row.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldTicketRow } from "./ticket-row";

afterEach(cleanup);

it("prints the ask as body copy", () => {
  render(
    <MeldTicketRow
      kind="approve"
      source="ONBOARDING · FIRST RUN"
      age="4h"
      ask="Design agent drew 2 screens and wants a yes or no."
    />,
  );

  expect(
    screen.getByText("Design agent drew 2 screens and wants a yes or no."),
  ).toBeInTheDocument();
});

it("shows where the work came from and how long it has waited", () => {
  render(
    <MeldTicketRow
      kind="review"
      source="CHECKOUT · PAYMENTS"
      age="1d"
      ask="Sam edited 3 steps in the flow."
    />,
  );

  expect(screen.getByText("CHECKOUT · PAYMENTS")).toBeInTheDocument();
  expect(screen.getByText("1d")).toBeInTheDocument();
});

it("renders its action slot", () => {
  render(
    <MeldTicketRow
      kind="approve"
      source="ONBOARDING · FIRST RUN"
      age="4h"
      ask="Two screens are waiting."
    >
      <a href="/w/rooms/r">REVIEW</a>
    </MeldTicketRow>,
  );

  expect(screen.getByRole("link", { name: "REVIEW" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/ticket-row.test.tsx`
Expected: FAIL — "Failed to resolve import ./ticket-row".

- [ ] **Step 3: Write the implementation**

`apps/web/src/ui/meld/ticket-row.tsx`:

```tsx
import type { ReactNode } from "react";
import { MeldKindChip, type MeldPendingKind } from "./kind-chip";
import styles from "./ticket-row.module.css";

export type MeldTicketRowProps = {
  kind: MeldPendingKind;
  /** Where it came from, e.g. "CHECKOUT · GUEST FLOW". */
  source: string;
  /** How long it has been waiting, e.g. "2d". */
  age: string;
  /** The ask, in plain language. Body copy -- Archivo, not Pixelify. */
  ask: string;
  /** Action links. The deck navigates; it never writes. */
  children?: ReactNode;
};

export function MeldTicketRow({
  kind,
  source,
  age,
  ask,
  children,
}: MeldTicketRowProps) {
  return (
    <div className={styles.row} data-kind={kind}>
      <div className={styles.meta}>
        <MeldKindChip kind={kind} />
        <span className={styles.source}>{source}</span>
        <span className={styles.age}>{age}</span>
      </div>
      <p className={styles.ask}>{ask}</p>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </div>
  );
}
```

`apps/web/src/ui/meld/ticket-row.module.css`:

```css
.row {
  padding-block: var(--meld-space-2);
  border-bottom: var(--meld-hairline) solid var(--meld-deck-paper-line);
}

.row:last-child {
  border-bottom: 0;
}

.meta {
  display: flex;
  align-items: center;
  gap: var(--meld-space-2);
  margin-bottom: var(--meld-space-1);
}

.source,
.age {
  font-family: var(--meld-font-pixel);
  font-size: var(--meld-text-xs);
  color: var(--meld-deck-paper-muted);
}

.age {
  margin-left: auto;
}

.ask {
  font-size: var(--meld-text-base);
  line-height: 1.35;
  color: var(--meld-deck-paper-text);
}

.actions {
  display: flex;
  gap: var(--meld-space-2);
  margin-top: var(--meld-space-2);
}

.actions :global(a) {
  font-family: var(--meld-font-pixel);
  font-size: var(--meld-text-xs);
  letter-spacing: 0.06em;
  padding: var(--meld-space-1) var(--meld-space-2);
  clip-path: var(--meld-pixel-corner);
  background-color: var(--meld-accent);
  color: var(--meld-text-on-accent);
  text-decoration: none;
}

.actions :global(a:focus-visible) {
  box-shadow: inset 0 0 0 var(--meld-focus-ring) var(--meld-text);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/ticket-row.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Register and commit**

Add the `MeldTicketRow` entry to `COMPONENTS.md`, then:

```bash
pnpm check:astryx
git add apps/web/src/ui/meld/ticket-row.* apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): pending ticket row"
```

---

### Task 4: The ticket shell

**Files:**
- Create: `apps/web/src/ui/meld/ticket.tsx`, `ticket.module.css`, `ticket.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: deck tokens (Task 1).
- Produces: `MeldTicket({ title, count, subtitle, footer, children })`.

The torn edge is a repeating radial-gradient that paints the paper colour
*around* transparent notches, positioned outside the box — so the page shows
through the scallops. `clip-path` is not used on the ticket itself: it would
clip the tear strips away.

- [ ] **Step 1: Write the failing test**

`apps/web/src/ui/meld/ticket.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldTicket } from "./ticket";

afterEach(cleanup);

it("prints its heading and count", () => {
  render(
    <MeldTicket title="PENDING" count={4} subtitle="MELD STUDIO · THU 20 AUG">
      {"rows"}
    </MeldTicket>,
  );

  expect(screen.getByText("PENDING")).toBeInTheDocument();
  expect(screen.getByText("04")).toBeInTheDocument();
});

it("pads the count to two digits and stops at 99", () => {
  render(
    <MeldTicket title="PENDING" count={128} subtitle="MELD STUDIO">
      {"rows"}
    </MeldTicket>,
  );

  expect(screen.getByText("99+")).toBeInTheDocument();
});

it("renders children and footer", () => {
  render(
    <MeldTicket title="PENDING" count={0} subtitle="MELD STUDIO" footer={"crew"}>
      {"NOTHING PENDING"}
    </MeldTicket>,
  );

  expect(screen.getByText("NOTHING PENDING")).toBeInTheDocument();
  expect(screen.getByText("crew")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/ticket.test.tsx`
Expected: FAIL — "Failed to resolve import ./ticket".

- [ ] **Step 3: Write the implementation**

`apps/web/src/ui/meld/ticket.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./ticket.module.css";

export type MeldTicketProps = {
  /** Printed heading, e.g. "PENDING". */
  title: string;
  /** Shown top-right, zero-padded to two digits. */
  count: number;
  /** The printed line under the heading. */
  subtitle: string;
  /** Sits above the barcode -- the on-shift sprites. */
  footer?: ReactNode;
  children: ReactNode;
};

// Eleven bars of alternating height. Decorative: a receipt that stops dead
// above the tear reads as an unfinished panel rather than a printed slip.
const BARCODE = [100, 70, 100, 55, 100, 80, 100, 60, 100, 75, 100];

function printedCount(count: number): string {
  if (count > 99) return "99+";
  return String(count).padStart(2, "0");
}

/**
 * The dark paper the pending queue prints onto. Scalloped top and bottom,
 * dashed rules, barcode foot. Deliberately not `clip-path`-cornered: the
 * clip would slice the tear strips off.
 */
export function MeldTicket({
  title,
  count,
  subtitle,
  footer,
  children,
}: MeldTicketProps) {
  return (
    <div className={styles.ticket} data-testid="deck-ticket">
      <div className={`${styles.tear} ${styles.tearTop}`} aria-hidden />
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        <span className={styles.count}>{printedCount(count)}</span>
      </div>
      <div className={styles.subtitle}>{subtitle}</div>
      <div className={styles.rule} aria-hidden />
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
      <div className={styles.barcode} aria-hidden>
        {BARCODE.map((height, index) => (
          <i key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className={`${styles.tear} ${styles.tearBottom}`} aria-hidden />
    </div>
  );
}
```

`apps/web/src/ui/meld/ticket.module.css`:

```css
.ticket {
  position: relative;
  width: var(--meld-deck-ticket-width);
  background-color: var(--meld-deck-paper);
  color: var(--meld-deck-paper-text);
  padding: var(--meld-space-5);
  display: flex;
  flex-direction: column;
}

.tear {
  position: absolute;
  left: 0;
  right: 0;
  height: var(--meld-deck-tear);
  background: radial-gradient(
    circle var(--meld-deck-tear-radius) at var(--meld-deck-tear-radius) 0,
    transparent var(--meld-deck-tear-radius),
    var(--meld-deck-paper) var(--meld-deck-tear-radius)
  );
  background-size: calc(var(--meld-deck-tear-radius) * 2) var(--meld-deck-tear);
}

.tearTop {
  top: calc(var(--meld-deck-tear) * -1 + var(--meld-hairline));
  transform: rotate(180deg);
}

.tearBottom {
  bottom: calc(var(--meld-deck-tear) * -1 + var(--meld-hairline));
}

.head {
  display: flex;
  align-items: baseline;
}

.title,
.count {
  font-family: var(--meld-font-pixel);
  font-size: var(--meld-text-lg);
  letter-spacing: 0.2em;
}

.count {
  margin-left: auto;
  color: var(--meld-red);
}

.subtitle {
  font-family: var(--meld-font-pixel);
  font-size: var(--meld-text-xs);
  letter-spacing: 0.12em;
  color: var(--meld-deck-paper-muted);
}

.rule {
  border-top: var(--meld-pixel-step) dashed var(--meld-deck-paper-rule);
  margin-block: var(--meld-space-3);
}

.body {
  flex: 1;
}

.footer {
  margin-top: auto;
  padding-top: var(--meld-space-3);
}

.barcode {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: var(--meld-pixel-step);
  height: var(--meld-space-5);
  margin-top: var(--meld-space-3);
}

.barcode i {
  display: block;
  width: var(--meld-pixel-step);
  background-color: var(--meld-deck-paper-text);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/ticket.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Register and commit**

Add the `MeldTicket` entry to `COMPONENTS.md`, noting the no-`clip-path`
constraint, then:

```bash
pnpm check:astryx
git add apps/web/src/ui/meld/ticket.* apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): torn-paper ticket shell"
```

---

### Task 5: Agent sprite

**Files:**
- Create: `apps/web/src/ui/meld/agent-sprite.tsx`, `agent-sprite.module.css`, `agent-sprite.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: deck tokens (Task 1).
- Produces: `export type MeldAgentState = "working" | "waiting" | "idle"` and
  `MeldAgentSprite({ agent, state, label })` where
  `agent: "pm" | "design"`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/ui/meld/agent-sprite.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldAgentSprite } from "./agent-sprite";

afterEach(cleanup);

it("shows the caption", () => {
  render(<MeldAgentSprite agent="design" state="working" label="DESIGN · DRAWING" />);

  expect(screen.getByText("DESIGN · DRAWING")).toBeInTheDocument();
});

it("reflects state and agent for stable targeting", () => {
  render(<MeldAgentSprite agent="pm" state="waiting" label="PM · WAITING" />);

  const sprite = screen.getByTestId("agent-sprite");
  expect(sprite).toHaveAttribute("data-state", "waiting");
  expect(sprite).toHaveAttribute("data-agent", "pm");
});

it("only shows the activity meter while working", () => {
  const { rerender } = render(
    <MeldAgentSprite agent="design" state="working" label="DESIGN · DRAWING" />,
  );
  expect(screen.getByTestId("agent-meter")).toBeInTheDocument();

  rerender(<MeldAgentSprite agent="design" state="idle" label="DESIGN · IDLE" />);
  expect(screen.queryByTestId("agent-meter")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/agent-sprite.test.tsx`
Expected: FAIL — "Failed to resolve import ./agent-sprite".

- [ ] **Step 3: Write the implementation**

`apps/web/src/ui/meld/agent-sprite.tsx`. The sprite is inline SVG so the pixel
shapes stay crisp and the brush can animate. Colours come from tokens via
`currentColor` and CSS custom properties set in the module, not from SVG
attributes — a literal hex in the markup would fail `check:astryx`.

```tsx
import styles from "./agent-sprite.module.css";

export type MeldAgentState = "working" | "waiting" | "idle";

export type MeldAgentSpriteProps = {
  agent: "pm" | "design";
  state: MeldAgentState;
  /** Caption under the sprite, e.g. "DESIGN · DRAWING". */
  label: string;
};

/**
 * A teammate, standing on the ticket. The only thing on the deck that moves,
 * and it must never claim work that is not running -- `state` comes from
 * in-flight tasks, never from a guess.
 */
export function MeldAgentSprite({ agent, state, label }: MeldAgentSpriteProps) {
  return (
    <div
      className={styles.sprite}
      data-testid="agent-sprite"
      data-agent={agent}
      data-state={state}
    >
      {state === "working" ? (
        <div className={styles.meter} data-testid="agent-meter" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : null}
      <svg className={styles.body} viewBox="0 0 32 34" role="presentation">
        <rect className={styles.torso} x="6" y="15" width="14" height="17" />
        <rect className={styles.head} x="6" y="3" width="14" height="13" />
        <rect className={styles.eye} x="9" y="8" width="3" height="3" />
        <rect className={styles.eye} x="15" y="8" width="3" height="3" />
        {agent === "design" ? (
          <g className={styles.brush}>
            <rect className={styles.handle} x="19" y="18" width="9" height="3" />
            <rect className={styles.bristle} x="27" y="17" width="3" height="5" />
          </g>
        ) : null}
      </svg>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
```

`apps/web/src/ui/meld/agent-sprite.module.css`:

```css
.sprite {
  text-align: center;
}

.body {
  height: var(--meld-deck-sprite-height);
  width: auto;
}

.torso {
  fill: var(--meld-burgundy);
  stroke: var(--meld-black);
  stroke-width: var(--meld-pixel-step);
}

.sprite[data-agent="pm"] .torso {
  fill: var(--meld-sky-deep);
}

.head {
  fill: var(--meld-line);
  stroke: var(--meld-black);
  stroke-width: var(--meld-pixel-step);
}

.eye {
  fill: var(--meld-green);
}

.sprite[data-agent="pm"] .eye {
  fill: var(--meld-text);
}

.handle {
  fill: var(--meld-white);
}

.bristle {
  fill: var(--meld-pink);
}

.label {
  font-family: var(--meld-font-pixel);
  font-size: var(--meld-text-xs);
  letter-spacing: 0.08em;
  color: var(--meld-deck-paper-muted);
}

.meter {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: var(--meld-pixel-step);
  height: var(--meld-space-3);
}

.meter i {
  display: block;
  width: var(--meld-pixel-step);
  height: var(--meld-space-3);
  background-color: var(--meld-accent);
  animation: meter 900ms ease-in-out infinite;
}

.meter i:nth-child(2) { animation-delay: 150ms; }
.meter i:nth-child(3) { animation-delay: 300ms; }
.meter i:nth-child(4) { animation-delay: 450ms; }

.sprite[data-state="working"] .body {
  animation: bob 2200ms ease-in-out infinite;
}

.sprite[data-state="working"] .brush {
  transform-origin: left center;
  animation: brush 1400ms ease-in-out infinite;
}

@keyframes bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(calc(var(--meld-pixel-step) * -1.5)); }
}

@keyframes brush {
  0%, 100% { transform: rotate(-8deg); }
  50% { transform: rotate(6deg); }
}

@keyframes meter {
  0%, 100% { height: var(--meld-pixel-step); }
  50% { height: var(--meld-space-3); }
}

@media (prefers-reduced-motion: reduce) {
  .sprite[data-state="working"] .body,
  .sprite[data-state="working"] .brush,
  .meter i {
    animation: none;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/agent-sprite.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Register and commit**

Add the `MeldAgentSprite` entry to `COMPONENTS.md`, then:

```bash
pnpm check:astryx
git add apps/web/src/ui/meld/agent-sprite.* apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): agent sprite with honest activity state"
```

---

### Task 6: Peek card and project tile

**Files:**
- Create: `apps/web/src/ui/meld/peek-card.tsx`, `peek-card.module.css`, `peek-card.test.tsx`
- Create: `apps/web/src/ui/meld/project-tile.tsx`, `project-tile.module.css`, `project-tile.test.tsx`
- Modify: `apps/web/src/ui/meld/COMPONENTS.md`

**Interfaces:**
- Consumes: deck tokens (Task 1).
- Produces:
  `export type MeldPeekShape = "doc" | "screens" | "brief"`,
  `export type MeldTileColor = "teal" | "blue" | "purple" | "pink" | "red" | "yellow" | "orange" | "cyan" | "green" | "gray"`
  (mirrors `PROJECT_COLOR_OPTIONS` in `features/projects/schemas.ts`),
  `MeldPeekCard({ shape, color })`,
  `MeldProjectTile({ name, color, roomCount, updatedLabel, isLive, unreadCount, peek })`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/ui/meld/peek-card.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldPeekCard } from "./peek-card";

afterEach(cleanup);

it("reflects shape and colour for stable targeting", () => {
  render(<MeldPeekCard shape="screens" color="pink" />);

  const card = screen.getByTestId("peek-card");
  expect(card).toHaveAttribute("data-shape", "screens");
  expect(card).toHaveAttribute("data-color", "pink");
});

it("is decorative", () => {
  render(<MeldPeekCard shape="doc" color="blue" />);

  expect(screen.getByTestId("peek-card")).toHaveAttribute("aria-hidden", "true");
});
```

`apps/web/src/ui/meld/project-tile.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldProjectTile } from "./project-tile";

afterEach(cleanup);

it("shows the name and what is inside", () => {
  render(
    <MeldProjectTile
      name="Checkout redesign"
      color="blue"
      roomCount={3}
      updatedLabel="2h"
    />,
  );

  expect(screen.getByText("Checkout redesign")).toBeInTheDocument();
  expect(screen.getByText("3 rooms · 2h")).toBeInTheDocument();
});

it("says one room in the singular", () => {
  render(
    <MeldProjectTile name="Growth" color="green" roomCount={1} updatedLabel="2w" />,
  );

  expect(screen.getByText("1 room · 2w")).toBeInTheDocument();
});

it("flags a live agent and an unread count", () => {
  render(
    <MeldProjectTile
      name="Checkout redesign"
      color="blue"
      roomCount={3}
      updatedLabel="2h"
      isLive
      unreadCount={3}
    />,
  );

  expect(screen.getByText("LIVE")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
});

it("hides the unread badge at zero", () => {
  render(
    <MeldProjectTile
      name="Growth"
      color="green"
      roomCount={1}
      updatedLabel="2w"
      unreadCount={0}
    />,
  );

  expect(screen.queryByTestId("tile-unread")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/peek-card.test.tsx src/ui/meld/project-tile.test.tsx`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write the implementations**

`apps/web/src/ui/meld/peek-card.tsx`:

```tsx
import styles from "./peek-card.module.css";

export type MeldPeekShape = "doc" | "screens" | "brief";

export type MeldTileColor =
  | "teal"
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "yellow"
  | "orange"
  | "cyan"
  | "green"
  | "gray";

export type MeldPeekCardProps = {
  shape: MeldPeekShape;
  color: MeldTileColor;
};

/**
 * The top of the project's most recent thing, poking out from behind the
 * tile. Decorative on purpose: it is a shape cue, not a readable preview, so
 * it renders rule lines rather than real text.
 */
export function MeldPeekCard({ shape, color }: MeldPeekCardProps) {
  return (
    <div
      className={styles.card}
      data-testid="peek-card"
      data-shape={shape}
      data-color={color}
      aria-hidden="true"
    >
      <div className={styles.strip} />
      {shape === "screens" ? (
        <div className={styles.screens}>
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className={styles.lines}>
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}
```

`apps/web/src/ui/meld/peek-card.module.css`:

```css
.card {
  position: absolute;
  inset-block-start: calc(var(--meld-space-3) * -1);
  inset-inline-end: calc(var(--meld-space-1) * -1);
  width: var(--meld-deck-peek-width);
  height: var(--meld-deck-peek-height);
  padding: var(--meld-space-1);
  background-color: var(--meld-surface);
  border: var(--meld-hairline) solid var(--meld-line-strong);
  clip-path: var(--meld-pixel-corner);
  transform: rotate(5deg);
  z-index: 2;
}

.card[data-color="blue"] { --peek-accent: var(--meld-sky); }
.card[data-color="cyan"] { --peek-accent: var(--meld-sky); }
.card[data-color="teal"] { --peek-accent: var(--meld-green); }
.card[data-color="green"] { --peek-accent: var(--meld-green); }
.card[data-color="pink"] { --peek-accent: var(--meld-pink); }
.card[data-color="purple"] { --peek-accent: var(--meld-burgundy); }
.card[data-color="red"] { --peek-accent: var(--meld-red); }
.card[data-color="orange"] { --peek-accent: var(--meld-red); }
.card[data-color="yellow"] { --peek-accent: var(--meld-yellow); }
.card[data-color="gray"] { --peek-accent: var(--meld-text-muted); }

.strip {
  height: var(--meld-space-1);
  background-color: var(--peek-accent, var(--meld-sky));
  margin: calc(var(--meld-space-1) * -1) calc(var(--meld-space-1) * -1)
    var(--meld-space-1);
}

.lines i {
  display: block;
  height: var(--meld-pixel-step);
  background-color: var(--meld-line);
  margin-bottom: var(--meld-pixel-step);
}

.lines i:nth-child(1) { width: 80%; }
.lines i:nth-child(2) { width: 60%; }
.lines i:nth-child(3) { width: 70%; }

.card[data-shape="brief"] .lines i:nth-child(1) { width: 90%; }
.card[data-shape="brief"] .lines i:nth-child(2) { width: 70%; }
.card[data-shape="brief"] .lines i:nth-child(3) { width: 85%; }

.screens {
  display: flex;
  gap: var(--meld-pixel-step);
}

.screens i {
  display: block;
  flex: 1;
  height: var(--meld-space-5);
  background-color: var(--meld-surface-sunken);
  border: var(--meld-hairline) solid var(--meld-line);
}
```

`apps/web/src/ui/meld/project-tile.tsx`:

```tsx
import type { ReactNode } from "react";
import type { MeldTileColor } from "./peek-card";
import styles from "./project-tile.module.css";

export type MeldProjectTileProps = {
  name: string;
  color: MeldTileColor;
  roomCount: number;
  /** Relative time, already formatted, e.g. "2h". */
  updatedLabel: string;
  /** An agent is working in this project right now. */
  isLive?: boolean;
  unreadCount?: number;
  /** A `MeldPeekCard`. */
  peek?: ReactNode;
};

/**
 * A project as a container with its contents spilling out, not an icon. The
 * colour is a glow rather than a fill, so a row of tiles reads as one family
 * instead of a paint chart.
 */
export function MeldProjectTile({
  name,
  color,
  roomCount,
  updatedLabel,
  isLive = false,
  unreadCount = 0,
  peek,
}: MeldProjectTileProps) {
  const rooms = roomCount === 1 ? "1 room" : `${roomCount} rooms`;

  return (
    <div className={styles.wrap} data-color={color}>
      {peek}
      <div className={styles.tile}>
        <div className={styles.glow} aria-hidden />
        {isLive ? <span className={styles.live}>LIVE</span> : null}
        {unreadCount > 0 ? (
          <span className={styles.unread} data-testid="tile-unread">
            {unreadCount}
          </span>
        ) : null}
        <div className={styles.name}>{name}</div>
        <div className={styles.count}>{`${rooms} · ${updatedLabel}`}</div>
      </div>
    </div>
  );
}
```

`apps/web/src/ui/meld/project-tile.module.css`:

```css
.wrap {
  position: relative;
}

.wrap[data-color="blue"], .wrap[data-color="cyan"] { --tile-accent: var(--meld-sky); }
.wrap[data-color="teal"], .wrap[data-color="green"] { --tile-accent: var(--meld-green); }
.wrap[data-color="pink"] { --tile-accent: var(--meld-pink); }
.wrap[data-color="purple"] { --tile-accent: var(--meld-burgundy); }
.wrap[data-color="red"], .wrap[data-color="orange"] { --tile-accent: var(--meld-red); }
.wrap[data-color="yellow"] { --tile-accent: var(--meld-yellow); }
.wrap[data-color="gray"] { --tile-accent: var(--meld-text-muted); }

.tile {
  position: relative;
  height: var(--meld-deck-tile-height);
  padding: var(--meld-space-3);
  background-color: var(--meld-deck-paper);
  color: var(--meld-deck-paper-text);
  clip-path: var(--meld-pixel-corner);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
}

.glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    70% 70% at 12% 8%,
    var(--tile-accent, var(--meld-sky)) 0%,
    transparent 68%
  );
  opacity: 0.26;
}

.name {
  position: relative;
  font-size: var(--meld-text-lg);
  font-weight: var(--meld-weight-medium);
  letter-spacing: var(--meld-tracking-tight);
  line-height: 1.15;
}

.count {
  position: relative;
  font-family: var(--meld-font-pixel);
  font-size: var(--meld-text-xs);
  color: var(--meld-deck-paper-muted);
}

.live,
.unread {
  position: absolute;
  inset-block-start: var(--meld-space-2);
  inset-inline-start: var(--meld-space-3);
  z-index: 3;
  font-family: var(--meld-font-pixel);
  font-size: var(--meld-text-xs);
}

.live {
  color: var(--meld-green);
}

.unread {
  padding-inline: var(--meld-space-1);
  background-color: var(--meld-red);
  color: var(--meld-white);
  clip-path: var(--meld-pixel-corner);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @meld/web exec vitest run src/ui/meld/peek-card.test.tsx src/ui/meld/project-tile.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Register and commit**

Add both entries to `COMPONENTS.md`, noting that `MeldTileColor` mirrors
`PROJECT_COLOR_OPTIONS`, then:

```bash
pnpm check:astryx
git add apps/web/src/ui/meld/peek-card.* apps/web/src/ui/meld/project-tile.* apps/web/src/ui/meld/COMPONENTS.md
git commit -m "feat(meld): project tile with peek card"
```

---

### Task 7: `room_idle` kind and the idle-room resolver

**Files:**
- Modify: `apps/web/src/features/home/attention/types.ts`
- Create: `apps/web/src/features/home/attention/idle-room-resolver.ts`, `idle-room-resolver.test.ts`

**Interfaces:**
- Consumes: `AttentionResolver`, `AttentionItem` from `./types`.
- Produces: `createIdleRoomResolver({ rooms, now, idleDays }): AttentionResolver`.
  `rooms` is `Room[]` from `@/features/rooms/repository` — already fetched by the
  page, so this resolver issues **no query at all**.

`Room` (see `apps/web/src/features/rooms/repository.ts:26-39`) carries `id`,
`workspaceId`, `projectId`, `name`, `stage`, `updatedAt`, `lastActivityAt`.

- [ ] **Step 1: Extend the types**

In `apps/web/src/features/home/attention/types.ts`, add `"room_idle"` to the
`AttentionKind` union and three optional fields to `AttentionItem`:

```ts
export type AttentionKind =
  | "mention"
  | "agent_run_failed"
  | "agent_result_review"
  | "approval_request"
  | "assigned_work"
  | "decision_needed"
  // A room that has stopped moving. Computed at read time from activity
  // timestamps -- nothing is persisted to support it.
  | "room_idle";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  title: string;
  roomId: string;
  roomName: string;
  actorName?: string;
  occurredAt: string;
  href: string;
  /** Source line on the ticket, e.g. the owning project's name. */
  projectName?: string;
  /** Overrides the per-kind default action label. */
  actionLabel?: string;
  /** A second, quieter destination for the row. */
  secondaryHref?: string;
};
```

- [ ] **Step 2: Write the failing test**

`apps/web/src/features/home/attention/idle-room-resolver.test.ts`:

```ts
import { expect, it } from "vitest";
import { createIdleRoomResolver } from "./idle-room-resolver";
import type { Room } from "@/features/rooms/repository";

const CONTEXT = {
  userId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000001",
};

const NOW = new Date("2026-08-20T12:00:00.000Z");

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: "40000000-0000-4000-8000-000000000004",
    workspaceId: CONTEXT.workspaceId,
    projectId: "30000000-0000-4000-8000-000000000003",
    name: "Invites",
    ownerId: CONTEXT.userId,
    stage: "discovery",
    updatedAt: "2026-08-14T12:00:00.000Z",
    createdAt: "2026-08-01T12:00:00.000Z",
    lastActivityAt: "2026-08-14T12:00:00.000Z",
    ...overrides,
  };
}

it("reports a room that has not moved for longer than the threshold", async () => {
  const resolver = createIdleRoomResolver({
    rooms: [room()],
    now: NOW,
    idleDays: 5,
  });

  const items = await resolver.resolve(CONTEXT);

  expect(items).toHaveLength(1);
  expect(items[0].kind).toBe("room_idle");
  expect(items[0].title).toBe("Nothing has moved here in 6 days.");
  expect(items[0].href).toBe(
    `/${CONTEXT.workspaceId}/rooms/40000000-0000-4000-8000-000000000004`,
  );
  expect(items[0].occurredAt).toBe("2026-08-14T12:00:00.000Z");
});

it("ignores a room that is still moving", async () => {
  const resolver = createIdleRoomResolver({
    rooms: [room({ lastActivityAt: "2026-08-19T12:00:00.000Z" })],
    now: NOW,
    idleDays: 5,
  });

  expect(await resolver.resolve(CONTEXT)).toEqual([]);
});

it("ignores rooms from another workspace", async () => {
  const resolver = createIdleRoomResolver({
    rooms: [room({ workspaceId: "90000000-0000-4000-8000-000000000009" })],
    now: NOW,
    idleDays: 5,
  });

  expect(await resolver.resolve(CONTEXT)).toEqual([]);
});

it("reports the oldest room first", async () => {
  const resolver = createIdleRoomResolver({
    rooms: [
      room({ id: "a", lastActivityAt: "2026-08-13T12:00:00.000Z" }),
      room({ id: "b", lastActivityAt: "2026-08-01T12:00:00.000Z" }),
    ],
    now: NOW,
    idleDays: 5,
  });

  const items = await resolver.resolve(CONTEXT);

  expect(items.map((item) => item.id)).toEqual([
    "room-idle-b",
    "room-idle-a",
  ]);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/attention/idle-room-resolver.test.ts`
Expected: FAIL — "Failed to resolve import ./idle-room-resolver".

- [ ] **Step 4: Write the implementation**

`apps/web/src/features/home/attention/idle-room-resolver.ts`:

```ts
import type { Room } from "@/features/rooms/repository";
import type { AttentionItem, AttentionResolver } from "./types";

// A room is stale once it has been quiet for this long. A guess, not a
// measurement -- revisit once there is a week of real usage to look at.
export const DEFAULT_IDLE_DAYS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type IdleRoomResolverInput = {
  /** Already fetched by the page -- this resolver issues no query. */
  rooms: Room[];
  now: Date;
  idleDays?: number;
};

export function createIdleRoomResolver({
  rooms,
  now,
  idleDays = DEFAULT_IDLE_DAYS,
}: IdleRoomResolverInput): AttentionResolver {
  return {
    kind: "room_idle",
    async resolve(context) {
      return rooms
        .filter((room) => room.workspaceId === context.workspaceId)
        .map((room) => ({
          room,
          days: Math.floor(
            (now.getTime() - new Date(room.lastActivityAt).getTime()) /
              MS_PER_DAY,
          ),
        }))
        .filter(({ days }) => days > idleDays)
        // Quietest first: the room that has been dead longest is the one
        // most likely to have been forgotten.
        .sort((left, right) => right.days - left.days)
        .map(({ room, days }): AttentionItem => ({
          id: `room-idle-${room.id}`,
          kind: "room_idle",
          title: `Nothing has moved here in ${days} days.`,
          roomId: room.id,
          roomName: room.name,
          occurredAt: room.lastActivityAt,
          href: `/${context.workspaceId}/rooms/${room.id}`,
          actionLabel: "RESUME",
        }));
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/attention/idle-room-resolver.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Verify nothing else broke**

Run: `pnpm --filter @meld/web exec vitest run src/features/home && pnpm --filter @meld/web typecheck`
Expected: PASS. The new `AttentionItem` fields are optional, so existing
resolvers still compile.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/home/attention/types.ts apps/web/src/features/home/attention/idle-room-resolver.*
git commit -m "feat(home): room_idle attention kind computed from room activity"
```

---

### Task 8: Agent task resolver

**Files:**
- Create: `apps/web/src/features/home/attention/agent-task-resolver.ts`, `agent-task-resolver.test.ts`

**Interfaces:**
- Consumes: `AttentionItem`, `AttentionResolver`, `AttentionKind`.
- Produces: `createAgentTaskResolver(supabase, kind)` where
  `kind: "approval_request" | "agent_run_failed"`, plus the exported types
  `AgentTaskRow` and `AgentTaskQueryClient`.

**Schema facts** (verified — do not re-derive):
`public.ai_tasks` has `id`, `initiating_user_id`, `room_id`, `status`,
`error_message`, `updated_at`. `ai_task_status` is
`queued | waiting_for_device | ready_to_run | running | needs_reauthentication |
usage_limit_reached | needs_review | completed | cancelled | failed`.
`needs_review` is precisely "the agent finished and is holding for you";
`failed` is the failure case. `discovery_rooms` was renamed to `rooms` in
`202608110001_workspace_room_vocabulary.sql`, so the PostgREST embed is
`rooms!inner(name,workspace_id)` — exactly as `mention-resolver.ts` does it.

RLS on `ai_tasks` does not enforce the workspace boundary, so **the query must**:
scope by `initiating_user_id` *and* by the embedded `rooms.workspace_id`, the
same belt-and-braces `mention-resolver.ts` uses.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/home/attention/agent-task-resolver.test.ts`. Follow the
recorded-calls pattern from `mention-resolver.test.ts` — the filters are
delegated to PostgREST, so asserting on returned rows alone cannot prove the
resolver asked for them.

```ts
import { expect, it } from "vitest";
import {
  createAgentTaskResolver,
  type AgentTaskQueryClient,
  type AgentTaskRow,
} from "./agent-task-resolver";

const CONTEXT = {
  userId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000001",
};

type RecordedCalls = {
  from: string[];
  select: string[];
  eq: Array<[string, string]>;
  in: Array<[string, string[]]>;
  order: Array<[string, { ascending: boolean }]>;
  limit: number[];
};

function spyClient(result: {
  data: AgentTaskRow[] | null;
  error: { message: string } | null;
}) {
  const calls: RecordedCalls = {
    from: [],
    select: [],
    eq: [],
    in: [],
    order: [],
    limit: [],
  };

  const client: AgentTaskQueryClient = {
    from: (table) => {
      calls.from.push(table);
      return {
        select: (columns) => {
          calls.select.push(columns);
          return {
            eq: (userColumn, userValue) => {
              calls.eq.push([userColumn, userValue]);
              return {
                eq: (workspaceColumn, workspaceValue) => {
                  calls.eq.push([workspaceColumn, workspaceValue]);
                  return {
                    in: (statusColumn, statuses) => {
                      calls.in.push([statusColumn, statuses]);
                      return {
                        order: (orderColumn, options) => {
                          calls.order.push([orderColumn, options]);
                          return {
                            limit: async (count: number) => {
                              calls.limit.push(count);
                              return result;
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

function row(overrides: Partial<AgentTaskRow> = {}): AgentTaskRow {
  return {
    id: "50000000-0000-4000-8000-000000000005",
    room_id: "40000000-0000-4000-8000-000000000004",
    status: "needs_review",
    error_message: null,
    updated_at: "2026-08-20T10:00:00.000Z",
    rooms: { name: "First run", workspace_id: CONTEXT.workspaceId },
    ...overrides,
  };
}

it("asks the database for this user's held work in this workspace", async () => {
  const { client, calls } = spyClient({ data: [], error: null });

  await createAgentTaskResolver(client, "approval_request").resolve(CONTEXT);

  expect(calls.from).toEqual(["ai_tasks"]);
  expect(calls.eq).toEqual([
    ["initiating_user_id", CONTEXT.userId],
    ["rooms.workspace_id", CONTEXT.workspaceId],
  ]);
  expect(calls.in).toEqual([["status", ["needs_review"]]]);
  expect(calls.order).toEqual([["updated_at", { ascending: false }]]);
});

it("maps a held run to an approval row", async () => {
  const { client } = spyClient({ data: [row()], error: null });

  const items = await createAgentTaskResolver(
    client,
    "approval_request",
  ).resolve(CONTEXT);

  expect(items).toEqual([
    {
      id: "50000000-0000-4000-8000-000000000005",
      kind: "approval_request",
      title: "An agent finished and is waiting on your yes or no.",
      roomId: "40000000-0000-4000-8000-000000000004",
      roomName: "First run",
      occurredAt: "2026-08-20T10:00:00.000Z",
      href: `/${CONTEXT.workspaceId}/rooms/40000000-0000-4000-8000-000000000004`,
      actionLabel: "REVIEW",
    },
  ]);
});

it("asks for failed runs and reports the error", async () => {
  const { client, calls } = spyClient({
    data: [
      row({ status: "failed", error_message: "The provider timed out." }),
    ],
    error: null,
  });

  const items = await createAgentTaskResolver(
    client,
    "agent_run_failed",
  ).resolve(CONTEXT);

  expect(calls.in).toEqual([["status", ["failed"]]]);
  expect(items[0].kind).toBe("agent_run_failed");
  expect(items[0].title).toBe("The provider timed out.");
});

it("falls back to a generic title when there is no error message", async () => {
  const { client } = spyClient({
    data: [row({ status: "failed", error_message: null })],
    error: null,
  });

  const items = await createAgentTaskResolver(
    client,
    "agent_run_failed",
  ).resolve(CONTEXT);

  expect(items[0].title).toBe("An agent run failed.");
});

it("drops rows from another workspace", async () => {
  const { client } = spyClient({
    data: [
      row({
        rooms: {
          name: "Elsewhere",
          workspace_id: "90000000-0000-4000-8000-000000000009",
        },
      }),
    ],
    error: null,
  });

  const items = await createAgentTaskResolver(
    client,
    "approval_request",
  ).resolve(CONTEXT);

  expect(items).toEqual([]);
});

it("throws when the query fails so the registry can log and continue", async () => {
  const { client } = spyClient({
    data: null,
    error: { message: "boom" },
  });

  await expect(
    createAgentTaskResolver(client, "approval_request").resolve(CONTEXT),
  ).rejects.toThrow("We could not load agent runs.");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/attention/agent-task-resolver.test.ts`
Expected: FAIL — "Failed to resolve import ./agent-task-resolver".

- [ ] **Step 3: Write the implementation**

`apps/web/src/features/home/attention/agent-task-resolver.ts`:

```ts
import type { AttentionItem, AttentionResolver } from "./types";

// The two `ai_task_status` values that mean "a person has to do something".
// `needs_review` is the agent finishing and holding; `failed` is the run
// giving up. Every other status is in-flight or already settled.
const STATUS_BY_KIND = {
  approval_request: ["needs_review"],
  agent_run_failed: ["failed"],
} as const;

export type AgentTaskKind = keyof typeof STATUS_BY_KIND;

// Same cap and rationale as the mention resolver: this is a home-screen
// widget, not an inbox.
const MAX_TASKS = 50;

export type AgentTaskRow = {
  id: string;
  room_id: string;
  status: string;
  error_message: string | null;
  updated_at: string;
  rooms: {
    name: string;
    workspace_id: string;
  } | null;
};

export type AgentTaskQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          in: (
            column: string,
            values: readonly string[],
          ) => {
            order: (
              column: string,
              options: { ascending: boolean },
            ) => {
              limit: (count: number) => Promise<{
                data: AgentTaskRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };
};

export function createAgentTaskResolver(
  supabase: AgentTaskQueryClient,
  kind: AgentTaskKind,
): AttentionResolver {
  return {
    kind,
    async resolve(context) {
      const result = await supabase
        .from("ai_tasks")
        .select(
          "id,room_id,status,error_message,updated_at,rooms!inner(name,workspace_id)",
        )
        .eq("initiating_user_id", context.userId)
        // RLS on ai_tasks does not enforce the workspace boundary, so the
        // inner join must: PostgREST never returns another workspace's row
        // in the first place. Mirrors mention-resolver.ts.
        .eq("rooms.workspace_id", context.workspaceId)
        .in("status", STATUS_BY_KIND[kind])
        .order("updated_at", { ascending: false })
        .limit(MAX_TASKS);

      if (result.error) {
        throw new Error("We could not load agent runs.");
      }

      // Defence-in-depth, as in mention-resolver.ts: kept in case the query
      // above is ever weakened without this filter being updated with it.
      return (result.data ?? [])
        .filter(
          (row) => row.rooms?.workspace_id === context.workspaceId,
        )
        .map((row): AttentionItem => ({
          id: row.id,
          kind,
          title:
            kind === "approval_request"
              ? "An agent finished and is waiting on your yes or no."
              : (row.error_message ?? "An agent run failed."),
          roomId: row.room_id,
          roomName: row.rooms?.name ?? "a room",
          occurredAt: row.updated_at,
          href: `/${context.workspaceId}/rooms/${row.room_id}`,
          actionLabel: kind === "approval_request" ? "REVIEW" : "OPEN",
        }));
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/attention/agent-task-resolver.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/home/attention/agent-task-resolver.*
git commit -m "feat(home): approval and failed-run attention resolvers"
```

---

### Task 9: Wire pending items and agent presence

**Files:**
- Modify: `apps/web/src/features/home/actions.ts`
- Create: `apps/web/src/features/home/agent-presence.ts`, `agent-presence.test.ts`
- Create: `apps/web/src/features/home/pending.ts`, `pending.test.ts`

**Interfaces:**
- Consumes: `composeAttentionItems`, `createMentionResolver`,
  `createAgentTaskResolver` (Task 8), `createIdleRoomResolver` (Task 7).
- Produces:
  - `listPendingItems(workspaceId: string, rooms: Room[]): Promise<AttentionItem[]>`
    in `actions.ts`
  - `toPendingKind(kind: AttentionKind): MeldPendingKind` in `pending.ts`
  - `isAnyAgentWorking(supabase, workspaceId): Promise<boolean>` in
    `agent-presence.ts`

- [ ] **Step 1: Write the failing test for the kind mapping**

`apps/web/src/features/home/pending.test.ts`:

```ts
import { expect, it } from "vitest";
import { toPendingKind } from "./pending";

it("maps mentions and assigned work to review", () => {
  expect(toPendingKind("mention")).toBe("review");
  expect(toPendingKind("assigned_work")).toBe("review");
});

it("maps holds to approve", () => {
  expect(toPendingKind("approval_request")).toBe("approve");
  expect(toPendingKind("agent_result_review")).toBe("approve");
});

it("maps failures to failed", () => {
  expect(toPendingKind("agent_run_failed")).toBe("failed");
});

it("maps idle rooms to stale", () => {
  expect(toPendingKind("room_idle")).toBe("stale");
});

it("falls back to review for an unmapped kind", () => {
  expect(toPendingKind("decision_needed")).toBe("review");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/pending.test.ts`
Expected: FAIL — "Failed to resolve import ./pending".

- [ ] **Step 3: Implement the mapping**

`apps/web/src/features/home/pending.ts`:

```ts
import type { MeldPendingKind } from "@/ui/meld/kind-chip";
import type { AttentionKind } from "./attention/types";

// The ticket prints four chips; the attention registry knows about more
// kinds than that. `decision_needed` and `assigned_work` have no resolver
// wired (see the design doc), so their mapping only matters if one is added
// later -- review is the safe default because it never claims an action the
// deck cannot perform.
const KINDS: Record<AttentionKind, MeldPendingKind> = {
  mention: "review",
  assigned_work: "review",
  decision_needed: "review",
  approval_request: "approve",
  agent_result_review: "approve",
  agent_run_failed: "failed",
  room_idle: "stale",
};

export function toPendingKind(kind: AttentionKind): MeldPendingKind {
  return KINDS[kind] ?? "review";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/pending.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing test for agent presence**

`apps/web/src/features/home/agent-presence.test.ts`:

```ts
import { expect, it } from "vitest";
import {
  isAnyAgentWorking,
  type PresenceQueryClient,
} from "./agent-presence";

const WORKSPACE = "20000000-0000-4000-8000-000000000001";

function client(result: {
  data: Array<{ id: string }> | null;
  error: { message: string } | null;
}): { client: PresenceQueryClient; statuses: string[][] } {
  const statuses: string[][] = [];
  return {
    statuses,
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: (_column: string, values: readonly string[]) => {
              statuses.push([...values]);
              return { limit: async () => result };
            },
          }),
        }),
      }),
    },
  };
}

it("is true while a run is in flight", async () => {
  const { client: spy, statuses } = client({
    data: [{ id: "task" }],
    error: null,
  });

  expect(await isAnyAgentWorking(spy, WORKSPACE)).toBe(true);
  expect(statuses).toEqual([["running", "ready_to_run", "queued"]]);
});

it("is false when nothing is running", async () => {
  const { client: spy } = client({ data: [], error: null });

  expect(await isAnyAgentWorking(spy, WORKSPACE)).toBe(false);
});

it("is false rather than throwing when the query fails", async () => {
  const { client: spy } = client({ data: null, error: { message: "boom" } });

  expect(await isAnyAgentWorking(spy, WORKSPACE)).toBe(false);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/agent-presence.test.ts`
Expected: FAIL — "Failed to resolve import ./agent-presence".

- [ ] **Step 7: Implement agent presence**

`apps/web/src/features/home/agent-presence.ts`:

```ts
// The three statuses that mean an agent is between "asked" and "answered".
const IN_FLIGHT = ["running", "ready_to_run", "queued"] as const;

export type PresenceQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        in: (
          column: string,
          values: readonly string[],
        ) => {
          limit: (count: number) => Promise<{
            data: Array<{ id: string }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

/**
 * Whether any agent is mid-run in this workspace. Drives the working sprite
 * on the ticket, so it fails closed: a broken query renders an idle agent
 * rather than animating a teammate that is not actually working.
 */
export async function isAnyAgentWorking(
  supabase: PresenceQueryClient,
  workspaceId: string,
): Promise<boolean> {
  const result = await supabase
    .from("ai_tasks")
    .select("id,rooms!inner(workspace_id)")
    .eq("rooms.workspace_id", workspaceId)
    .in("status", IN_FLIGHT)
    .limit(1);

  if (result.error) {
    return false;
  }

  return (result.data ?? []).length > 0;
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/agent-presence.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Wire the resolvers into `actions.ts`**

In `apps/web/src/features/home/actions.ts`, add alongside the existing
`listAttentionItems` (leave that export in place — it still backs the old
`NeedsAttention` component until Task 12 removes its call site):

```ts
import type { Room } from "@/features/rooms/repository";
import { createAgentTaskResolver } from "./attention/agent-task-resolver";
import { createIdleRoomResolver } from "./attention/idle-room-resolver";

export async function listPendingItems(
  workspaceId: string,
  rooms: Room[],
): Promise<AttentionItem[]> {
  const supabase = await createClient(new Headers());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  return composeAttentionItems(
    [
      createMentionResolver(
        supabase as unknown as MentionQueryClient,
      ),
      createAgentTaskResolver(
        supabase as unknown as AgentTaskQueryClient,
        "approval_request",
      ),
      createAgentTaskResolver(
        supabase as unknown as AgentTaskQueryClient,
        "agent_run_failed",
      ),
      // No query: the page already fetched the rooms.
      createIdleRoomResolver({ rooms, now: new Date() }),
    ],
    { userId: user.id, workspaceId },
  );
}
```

Add the matching type imports (`AgentTaskQueryClient`) at the top of the file.

- [ ] **Step 10: Verify the whole feature still passes**

Run: `pnpm --filter @meld/web exec vitest run src/features/home && pnpm --filter @meld/web typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/features/home/actions.ts apps/web/src/features/home/pending.* apps/web/src/features/home/agent-presence.*
git commit -m "feat(home): compose pending items and agent presence"
```

---

### Task 10: Pending ticket and project column

**Files:**
- Create: `apps/web/src/features/home/components/pending-ticket.tsx`, `pending-ticket.test.tsx`
- Create: `apps/web/src/features/home/components/project-column.tsx`, `project-column.test.tsx`
- Create: `apps/web/src/features/home/relative-time.ts`, `relative-time.test.ts`

**Interfaces:**
- Consumes: `MeldTicket`, `MeldTicketRow`, `MeldAgentSprite`, `MeldProjectTile`,
  `MeldPeekCard`, `toPendingKind`.
- Produces:
  - `formatRelativeTime(iso: string, now: Date): string`
  - `PendingTicket({ items, isAgentWorking, printedOn })`
  - `ProjectColumn({ workspaceId, projects })` where each project is
    `{ id, name, color, roomCount, updatedAt, isLive, unreadCount, peekShape }`

**No raw elements here.** These files live outside `ui/meld/`, so every wrapper
must be a primitive: `MeldStack` (vertical) and `MeldCenteredActions`
(horizontal, centred) from `stack.tsx`.

- [ ] **Step 1: Write the failing test for relative time**

`apps/web/src/features/home/relative-time.test.ts`:

```ts
import { expect, it } from "vitest";
import { formatRelativeTime } from "./relative-time";

const NOW = new Date("2026-08-20T12:00:00.000Z");

it("counts minutes under an hour", () => {
  expect(formatRelativeTime("2026-08-20T11:30:00.000Z", NOW)).toBe("30m");
});

it("counts hours under a day", () => {
  expect(formatRelativeTime("2026-08-20T08:00:00.000Z", NOW)).toBe("4h");
});

it("counts days under a fortnight", () => {
  expect(formatRelativeTime("2026-08-14T12:00:00.000Z", NOW)).toBe("6d");
});

it("counts weeks beyond that", () => {
  expect(formatRelativeTime("2026-08-01T12:00:00.000Z", NOW)).toBe("2w");
});

it("reads as now within the minute", () => {
  expect(formatRelativeTime("2026-08-20T11:59:40.000Z", NOW)).toBe("now");
});
```

- [ ] **Step 2: Run it to verify it fails, then implement**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/relative-time.test.ts`
Expected: FAIL — unresolved import.

`apps/web/src/features/home/relative-time.ts`:

```ts
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * The compact age printed on the ticket and on a tile ("2h", "6d"). Deliberately
 * not `Intl.RelativeTimeFormat`: this is metadata set in Pixelify at 11px, where
 * "6 days ago" does not fit and does not need to.
 */
export function formatRelativeTime(iso: string, now: Date): string {
  const elapsed = now.getTime() - new Date(iso).getTime();

  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 2 * WEEK) return `${Math.floor(elapsed / DAY)}d`;
  return `${Math.floor(elapsed / WEEK)}w`;
}
```

Run the test again. Expected: PASS (5 tests).

- [ ] **Step 3: Write the failing test for the pending ticket**

`apps/web/src/features/home/components/pending-ticket.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PendingTicket } from "./pending-ticket";
import type { AttentionItem } from "../attention/types";

afterEach(cleanup);

const NOW = new Date("2026-08-20T12:00:00.000Z");

function item(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: "item-1",
    kind: "approval_request",
    title: "An agent finished and is waiting on your yes or no.",
    roomId: "room-1",
    roomName: "First run",
    projectName: "Onboarding",
    occurredAt: "2026-08-20T08:00:00.000Z",
    href: "/w/rooms/room-1",
    actionLabel: "REVIEW",
    ...overrides,
  };
}

it("prints the count and a row per item", () => {
  render(
    <PendingTicket items={[item(), item({ id: "item-2" })]} printedOn={NOW} />,
  );

  expect(screen.getByText("02")).toBeInTheDocument();
  expect(screen.getAllByText("APPROVE")).toHaveLength(2);
});

it("builds the source line from project and room", () => {
  render(<PendingTicket items={[item()]} printedOn={NOW} />);

  expect(screen.getByText("ONBOARDING · FIRST RUN")).toBeInTheDocument();
});

it("shows the age of each item", () => {
  render(<PendingTicket items={[item()]} printedOn={NOW} />);

  expect(screen.getByText("4h")).toBeInTheDocument();
});

it("links the action to the room", () => {
  render(<PendingTicket items={[item()]} printedOn={NOW} />);

  expect(screen.getByRole("link", { name: "REVIEW" })).toHaveAttribute(
    "href",
    "/w/rooms/room-1",
  );
});

it("shows only the first four and counts the rest", () => {
  const items = Array.from({ length: 6 }, (_, index) =>
    item({ id: `item-${index}` }),
  );

  render(<PendingTicket items={items} printedOn={NOW} />);

  expect(screen.getAllByText("APPROVE")).toHaveLength(4);
  expect(screen.getByText("↓ 2 MORE")).toBeInTheDocument();
});

it("keeps its shape when nothing is pending", () => {
  render(<PendingTicket items={[]} printedOn={NOW} />);

  expect(screen.getByText("00")).toBeInTheDocument();
  expect(screen.getByText("NOTHING PENDING")).toBeInTheDocument();
  expect(screen.getAllByTestId("agent-sprite")).toHaveLength(2);
});

it("works the design sprite only when an agent is running", () => {
  const { rerender } = render(
    <PendingTicket items={[]} printedOn={NOW} isAgentWorking />,
  );
  expect(screen.getByTestId("agent-meter")).toBeInTheDocument();

  rerender(<PendingTicket items={[]} printedOn={NOW} />);
  expect(screen.queryByTestId("agent-meter")).not.toBeInTheDocument();
});

it("has the PM sprite waiting only when something is pending", () => {
  render(<PendingTicket items={[item()]} printedOn={NOW} />);

  expect(screen.getByText("PM · WAITING")).toBeInTheDocument();
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/components/pending-ticket.test.tsx`
Expected: FAIL — unresolved import.

- [ ] **Step 5: Implement the pending ticket**

`apps/web/src/features/home/components/pending-ticket.tsx`:

```tsx
import Link from "next/link";
import { MeldTicket } from "@/ui/meld/ticket";
import { MeldTicketRow } from "@/ui/meld/ticket-row";
import { MeldAgentSprite } from "@/ui/meld/agent-sprite";
import { MeldCenteredActions } from "@/ui/meld/stack";
import type { AttentionItem } from "../attention/types";
import { toPendingKind } from "../pending";
import { formatRelativeTime } from "../relative-time";

// Four rows is what fits above the sprites without the ticket scrolling.
const VISIBLE_ROWS = 4;

const DEFAULT_ACTION_LABEL = "OPEN";

export type PendingTicketProps = {
  items: AttentionItem[];
  /** "Now" for age formatting and the printed date. Injected so tests are stable. */
  printedOn: Date;
  isAgentWorking?: boolean;
};

function sourceLine(item: AttentionItem): string {
  const parts = [item.projectName, item.roomName].filter(Boolean);
  return parts.join(" · ").toUpperCase();
}

function printedDate(now: Date): string {
  return now
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    })
    .toUpperCase();
}

export function PendingTicket({
  items,
  printedOn,
  isAgentWorking = false,
}: PendingTicketProps) {
  const visible = items.slice(0, VISIBLE_ROWS);
  const overflow = items.length - visible.length;

  return (
    <MeldTicket
      title="PENDING"
      count={items.length}
      subtitle={`MELD STUDIO · ${printedDate(printedOn)}`}
      footer={
        <MeldCenteredActions>
          <MeldAgentSprite
            agent="pm"
            state={items.length > 0 ? "waiting" : "idle"}
            label={items.length > 0 ? "PM · WAITING" : "PM · IDLE"}
          />
          <MeldAgentSprite
            agent="design"
            state={isAgentWorking ? "working" : "idle"}
            label={isAgentWorking ? "DESIGN · DRAWING" : "DESIGN · IDLE"}
          />
        </MeldCenteredActions>
      }
    >
      {visible.length === 0 ? "NOTHING PENDING" : null}
      {visible.map((item) => (
        <MeldTicketRow
          key={item.id}
          kind={toPendingKind(item.kind)}
          source={sourceLine(item)}
          age={formatRelativeTime(item.occurredAt, printedOn)}
          ask={item.title}
        >
          <Link href={item.href}>
            {item.actionLabel ?? DEFAULT_ACTION_LABEL}
          </Link>
        </MeldTicketRow>
      ))}
      {overflow > 0 ? `↓ ${overflow} MORE` : null}
    </MeldTicket>
  );
}
```

`MeldCenteredActions` is a horizontal, centred row — verified in
`stack.module.css:111`. Do **not** introduce a raw `<div>` here.

- [ ] **Step 6: Run it to verify it passes**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/components/pending-ticket.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 7: Write the failing test for the project column**

`apps/web/src/features/home/components/project-column.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ProjectColumn, type DeckProject } from "./project-column";

afterEach(cleanup);

const NOW = new Date("2026-08-20T12:00:00.000Z");

function project(overrides: Partial<DeckProject> = {}): DeckProject {
  return {
    id: "project-1",
    name: "Checkout redesign",
    color: "blue",
    roomCount: 3,
    latestRoomId: "room-9",
    updatedAt: "2026-08-20T10:00:00.000Z",
    isLive: false,
    unreadCount: 0,
    peekShape: "doc",
    ...overrides,
  };
}

it("links each tile to the project's most recent room", () => {
  render(
    <ProjectColumn workspaceId="w1" projects={[project()]} printedOn={NOW} />,
  );

  expect(
    screen.getByRole("link", { name: /Checkout redesign/ }),
  ).toHaveAttribute("href", "/w1/rooms/room-9");
});

it("does not link a project that has no rooms yet", () => {
  render(
    <ProjectColumn
      workspaceId="w1"
      projects={[project({ roomCount: 0, latestRoomId: null })]}
      printedOn={NOW}
    />,
  );

  expect(screen.queryByRole("link", { name: /Checkout redesign/ })).toBeNull();
  expect(screen.getByText("Checkout redesign")).toBeInTheDocument();
});

it("shows the count of projects", () => {
  render(
    <ProjectColumn
      workspaceId="w1"
      projects={[project(), project({ id: "project-2", name: "Growth" })]}
      printedOn={NOW}
    />,
  );

  expect(screen.getByText("PROJECTS")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

it("always offers a way to make a new project", () => {
  render(<ProjectColumn workspaceId="w1" projects={[]} printedOn={NOW} />);

  expect(
    screen.getByRole("button", { name: "+ new project" }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 8: Run it to verify it fails, then implement**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/components/project-column.test.tsx`
Expected: FAIL — unresolved import.

`apps/web/src/features/home/components/project-column.tsx`:

This is a **client component** — the new-project affordance opens the existing
`CreateProjectDialog`, which is stateful.

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { MeldProjectTile } from "@/ui/meld/project-tile";
import {
  MeldPeekCard,
  type MeldPeekShape,
  type MeldTileColor,
} from "@/ui/meld/peek-card";
import { MeldStack } from "@/ui/meld/stack";
import { MeldButton } from "@/ui/meld/button";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { formatRelativeTime } from "../relative-time";

export type DeckProject = {
  id: string;
  name: string;
  color: MeldTileColor;
  roomCount: number;
  /**
   * Where the tile goes. There is no project page yet, so a tile opens the
   * project's most recently active room. `null` when the project has no rooms,
   * in which case the tile is not a link at all. Swap this for the project
   * route the day one exists -- it is the only line that needs to change.
   */
  latestRoomId: string | null;
  /** ISO timestamp of the most recent activity in the project. */
  updatedAt: string;
  isLive: boolean;
  unreadCount: number;
  peekShape: MeldPeekShape;
};

export type ProjectColumnProps = {
  workspaceId: string;
  projects: DeckProject[];
  printedOn: Date;
};

export function ProjectColumn({
  workspaceId,
  projects,
  printedOn,
}: ProjectColumnProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <MeldStack gap={4}>
      <MeldColumnHeading label="PROJECTS" count={projects.length} />
      {projects.map((project) => {
        const tile = (
          <MeldProjectTile
            name={project.name}
            color={project.color}
            roomCount={project.roomCount}
            updatedLabel={formatRelativeTime(project.updatedAt, printedOn)}
            isLive={project.isLive}
            unreadCount={project.unreadCount}
            peek={
              <MeldPeekCard shape={project.peekShape} color={project.color} />
            }
          />
        );

        return project.latestRoomId ? (
          <Link
            key={project.id}
            href={`/${workspaceId}/rooms/${project.latestRoomId}`}
          >
            {tile}
          </Link>
        ) : (
          <MeldStack key={project.id}>{tile}</MeldStack>
        );
      })}
      <MeldButton
        label="+ new project"
        variant="ghost"
        onClick={() => setIsCreateOpen(true)}
      />
      <CreateProjectDialog
        workspaceId={workspaceId}
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </MeldStack>
  );
}
```

`MeldColumnHeading` does not exist yet. Add it to `ui/meld/` in this task, with
its own colocated test: it renders `label` and `count` on one line, count
right-aligned, both in `var(--meld-font-pixel)` at `var(--meld-text-xs)`. It is
a new primitive, so it also needs a `COMPONENTS.md` entry.

Verify `MeldButton` accepts `onClick` (it does — it passes through every native
button attribute) and that `variant="ghost"` exists.

- [ ] **Step 9: Run all three test files**

Run: `pnpm --filter @meld/web exec vitest run src/features/home`
Expected: PASS.

- [ ] **Step 10: Conventions and commit**

```bash
pnpm check:astryx && pnpm check:test-colocation
git add apps/web/src/features/home
git commit -m "feat(home): pending ticket and project column"
```

---

### Task 11: The prompt, the shortcut line and the shortcut bindings

**Files:**
- Create: `apps/web/src/features/home/components/deck-prompt.tsx`, `deck-prompt.test.tsx`
- Create: `apps/web/src/features/home/components/shortcut-line.tsx`, `shortcut-line.test.tsx`
- Create: `apps/web/src/features/home/components/deck-shortcuts.tsx`, `deck-shortcuts.test.tsx`

**Interfaces:**
- Consumes: `MeldTextInput` (`ui/meld/text-input.tsx`).
- Produces: `DeckPrompt({ placeholder })`, `ShortcutLine()`,
  `DeckShortcuts({ workspaceId })`.

The prompt does not route anywhere in this plan — routing gets its own spec. It
must render, be labelled, and be focusable by `⌘K`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/home/components/deck-prompt.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DeckPrompt } from "./deck-prompt";

afterEach(cleanup);

it("is a labelled text box", () => {
  render(<DeckPrompt />);

  expect(
    screen.getByRole("textbox", { name: /what are we doing today/i }),
  ).toBeInTheDocument();
});

it("carries the deck prompt id so shortcuts can focus it", () => {
  render(<DeckPrompt />);

  expect(screen.getByRole("textbox")).toHaveAttribute("id", "deck-prompt");
});
```

`apps/web/src/features/home/components/shortcut-line.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ShortcutLine } from "./shortcut-line";

afterEach(cleanup);

it("advertises only the shortcuts that exist", () => {
  render(<ShortcutLine />);

  expect(screen.getByText("⌘N")).toBeInTheDocument();
  expect(screen.getByText("New project")).toBeInTheDocument();
  expect(screen.getByText("⌘K")).toBeInTheDocument();
  expect(screen.getByText("Ask anything")).toBeInTheDocument();
});

it("does not advertise a scratch room, which does not exist yet", () => {
  render(<ShortcutLine />);

  expect(screen.queryByText("⇧⌘N")).toBeNull();
});
```

`apps/web/src/features/home/components/deck-shortcuts.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DeckShortcuts } from "./deck-shortcuts";

afterEach(cleanup);

it("asks for a new project on command-N", async () => {
  const user = userEvent.setup();
  const onNewProject = vi.fn();
  render(<DeckShortcuts onNewProject={onNewProject} />);

  await user.keyboard("{Meta>}n{/Meta}");

  expect(onNewProject).toHaveBeenCalledTimes(1);
});

it("focuses the prompt on command-K", async () => {
  const user = userEvent.setup();
  const input = document.createElement("input");
  input.id = "deck-prompt";
  document.body.append(input);

  render(<DeckShortcuts onNewProject={vi.fn()} />);
  await user.keyboard("{Meta>}k{/Meta}");

  expect(document.activeElement).toBe(input);

  input.remove();
});

it("ignores an unmodified keypress", async () => {
  const user = userEvent.setup();
  const onNewProject = vi.fn();
  render(<DeckShortcuts onNewProject={onNewProject} />);

  await user.keyboard("n");

  expect(onNewProject).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/components/deck-prompt.test.tsx src/features/home/components/shortcut-line.test.tsx src/features/home/components/deck-shortcuts.test.tsx`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Implement the three components**

`apps/web/src/features/home/components/deck-prompt.tsx` — wrap `MeldTextInput`
(read `ui/meld/text-input.tsx` for its real props; it must receive `id="deck-prompt"`
and a visible-or-accessible label of "What are we doing today?").

`apps/web/src/features/home/components/shortcut-line.tsx` — renders three
`⟨keycap⟩ ⟨label⟩` pairs. If no primitive exists for a keycap, add
`MeldKeycap` to `ui/meld/` with its own test rather than using a raw `<span>`.

`apps/web/src/features/home/components/deck-shortcuts.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export type DeckShortcutsProps = {
  /** Opens the create-project dialog owned by `ProjectColumn`. */
  onNewProject: () => void;
};

/**
 * Keyboard bindings for the deck. Renders nothing.
 *
 * `⌘N` opens the create-project dialog rather than navigating: projects are
 * created by `CreateProjectDialog`, and there is no project route to push to.
 * `⇧⌘N` is deliberately unbound -- a "scratch room" does not exist yet, and a
 * shortcut that 404s is worse than no shortcut.
 */
export function DeckShortcuts({ onNewProject }: DeckShortcutsProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey) return;

      const key = event.key.toLowerCase();

      if (key === "k") {
        event.preventDefault();
        document.getElementById("deck-prompt")?.focus();
        return;
      }

      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        onNewProject();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNewProject]);

  return null;
}
```

Because `DeckShortcuts` now shares the dialog state that lives in
`ProjectColumn`, render it **inside** `ProjectColumn` (which is already a client
component) rather than in `deck.tsx`. Update Task 12's composition accordingly.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/components`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check:astryx && pnpm check:test-colocation
git add apps/web/src/features/home/components apps/web/src/ui/meld
git commit -m "feat(home): deck prompt, shortcut line and key bindings"
```

---

### Task 12: Compose the deck and move the shell off the landing route

**Files:**
- Create: `apps/web/src/features/home/components/deck.tsx`, `deck.test.tsx`, `deck.module.css`
- Create: `apps/web/src/features/workspaces/require-workspace-access.ts`
- Create: `apps/web/src/features/workspaces/workspace-shell-layout.tsx`
- Delete: `apps/web/src/app/(app)/[workspaceId]/layout.tsx`
- Create: `apps/web/src/app/(app)/[workspaceId]/rooms/layout.tsx`, `settings/layout.tsx`, `design-system/layout.tsx`
- Modify: `apps/web/src/app/(app)/[workspaceId]/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–11.
- Produces: `Deck({ workspaceId, workspaceName, projects, items, isAgentWorking, printedOn })`,
  `requireWorkspaceAccess(workspaceId)`.

`deck.module.css` lives outside `ui/meld/`, so it may **not** contain a literal
`px` or hex — position everything with the `--meld-deck-*` tokens from Task 1.
The `Deck` component itself must not use raw elements; it composes
`MeldDeckFrame`, `MeldWatermark`, `PendingTicket`, `ProjectColumn`,
`DeckPrompt`, `ShortcutLine` and `DeckShortcuts`.

- [ ] **Step 1: Extract the access guard**

Move the auth/membership block out of the existing
`apps/web/src/app/(app)/[workspaceId]/layout.tsx` into
`apps/web/src/features/workspaces/require-workspace-access.ts`, preserving its
exact behaviour: `redirect` to `/sign-in?next=…` when unauthenticated,
`notFound()` when not a member, otherwise return `access.data`.

```ts
import { notFound, redirect } from "next/navigation";
import { getWorkspaceBackend } from "./backend";

/**
 * The single auth + membership gate for every workspace surface. One
 * implementation on purpose: the deck renders outside the shell layout, and
 * two copies of this check is exactly how one of them ends up missing.
 */
export async function requireWorkspaceAccess(workspaceId: string) {
  const backend = await getWorkspaceBackend();
  const access = await backend.getWorkspaceShell(workspaceId);

  if (access.status === "unauthenticated") {
    redirect(`/sign-in?next=${encodeURIComponent(`/${workspaceId}`)}`);
  }
  if (access.status === "not-a-member") {
    notFound();
  }

  return access.data;
}
```

- [ ] **Step 2: Move the shell into a reusable layout component**

Create `apps/web/src/features/workspaces/workspace-shell-layout.tsx` containing
the `AppFrame` + `WorkspaceNavigation` body of the old layout, taking
`{ workspaceId, children }` and calling `requireWorkspaceAccess` itself.

- [ ] **Step 3: Move the layout down to the sub-routes**

Delete `apps/web/src/app/(app)/[workspaceId]/layout.tsx` **and move its
colocated `layout.test.tsx`** to sit beside
`features/workspaces/workspace-shell-layout.tsx`, retargeted at that component.
An orphaned test file fails `pnpm check:test-colocation`.

Create three layouts —
`rooms/layout.tsx`, `settings/layout.tsx`, `design-system/layout.tsx` — each:

```tsx
import type { ReactNode } from "react";
import { WorkspaceShellLayout } from "@/features/workspaces/workspace-shell-layout";

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <WorkspaceShellLayout workspaceId={workspaceId}>
      {children}
    </WorkspaceShellLayout>
  );
}
```

Check for any other route directly under `[workspaceId]/` that relied on the old
layout (`ls apps/web/src/app/\(app\)/\[workspaceId\]/`) and give it one too.
**A route left without a layout loses both its navigation and its access
check** — that is the failure this step must not produce.

- [ ] **Step 4: Write the failing test for the deck**

`apps/web/src/features/home/components/deck.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Deck } from "./deck";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

const NOW = new Date("2026-08-20T12:00:00.000Z");

it("shows the workspace, the ticket, the projects and the prompt", () => {
  render(
    <Deck
      workspaceId="w1"
      workspaceName="Nicholas' Studio"
      projects={[
        {
          id: "p1",
          name: "Checkout redesign",
          color: "blue",
          roomCount: 3,
          latestRoomId: "room-9",
          updatedAt: "2026-08-20T10:00:00.000Z",
          isLive: true,
          unreadCount: 0,
          peekShape: "doc",
        },
      ]}
      items={[]}
      printedOn={NOW}
    />,
  );

  expect(screen.getAllByText("Nicholas' Studio").length).toBeGreaterThan(0);
  expect(screen.getByTestId("deck-ticket")).toBeInTheDocument();
  expect(screen.getByText("Checkout redesign")).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toBeInTheDocument();
});
```

- [ ] **Step 5: Run it to verify it fails, then implement `deck.tsx`**

Run: `pnpm --filter @meld/web exec vitest run src/features/home/components/deck.test.tsx`
Expected: FAIL — unresolved import.

Compose the regions inside `MeldDeckFrame`, positioning each with
`deck.module.css` using only `--meld-deck-*` tokens. Include a top strip with
the workspace name. `DeckShortcuts` is rendered by `ProjectColumn`, not here —
it shares that component's dialog state.

- [ ] **Step 6: Point the page at the deck**

Rewrite `apps/web/src/app/(app)/[workspaceId]/page.tsx` to call
`requireWorkspaceAccess`, fetch projects and rooms in parallel, derive each
`DeckProject` by grouping `rooms` on `projectId` — `roomCount`, `updatedAt` and
`latestRoomId` all come from that grouping, using each room's `lastActivityAt`
— call `listPendingItems(workspaceId, rooms)` **only when
`rooms.length > 0`** — every kind is anchored to a room, so the result is
provably empty otherwise — and render `<Deck …/>`.

Delete the now-unused imports of `StartingPoints`, `NoProjectsEmptyState` and
`NeedsAttention` from this file. Leave those component files in place; removing
them is out of scope.

- [ ] **Step 7: Verify the whole app**

```bash
pnpm --filter @meld/web exec vitest run src/features/home src/ui/meld
pnpm --filter @meld/web typecheck
pnpm check:astryx && pnpm check:test-colocation
pnpm --filter @meld/web build
```
Expected: all pass. The build is the step that catches a route left without a
layout.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(home): the deck replaces the workspace landing page"
```

---

### Task 13: End-to-end coverage

**Files:**
- Create: `e2e/deck.spec.ts`

**Interfaces:**
- Consumes: the running app.

Read an existing spec in `e2e/` first and follow its sign-in and
workspace-seeding helpers exactly — do not invent a new fixture.

- [ ] **Step 1: Write the failing spec**

```ts
import { expect, test } from "@playwright/test";

test("the deck is the landing surface and has no sidebar", async ({ page }) => {
  // Sign in and land on a seeded workspace using this repo's existing helper.
  await page.goto("/");

  await expect(page.getByTestId("deck-frame")).toBeVisible();
  await expect(page.getByTestId("deck-ticket")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("command-K focuses the prompt", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Meta+k");

  await expect(page.locator("#deck-prompt")).toBeFocused();
});

test("a project tile navigates rather than opening a window", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("deck-frame").getByRole("link").first().click();

  // No project page exists yet, so a tile opens the project's latest room.
  await expect(page).toHaveURL(/\/rooms\//);
  await expect(page.getByTestId("deck-frame")).toHaveCount(0);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e -- deck.spec.ts`
Expected: PASS. If sign-in or seeding differs from the assumption above, fix the
spec to match the existing helpers rather than changing app code.

- [ ] **Step 3: Commit**

```bash
git add e2e/deck.spec.ts
git commit -m "test(e2e): deck landing surface"
```

---

## Self-Review

**Spec coverage.** Every section of the design doc maps to a task: the surface
and its grid → Tasks 1 and 12; Pending and its four kinds → Tasks 2–4, 7–10;
on-shift sprites → Tasks 5, 9, 10; project tiles and peek cards → Task 6, 10;
interaction and shortcuts → Task 11; the layout restructure → Task 12; testing →
every task plus Task 13. The backend boundary is a global constraint and is
re-stated in Tasks 8 and 9, the only tasks that touch data.

**Deferred deliberately, per the design doc:** prompt routing behaviour, item
counts on tiles, real thumbnails in peek cards, mobile layout, and the
`decision_needed` / `assigned_work` kinds.

**Type consistency.** `MeldPendingKind` is defined once (Task 2, `kind-chip.tsx`)
and imported by Tasks 3, 9 and 10. `MeldTileColor` and `MeldPeekShape` are
defined once (Task 6, `peek-card.tsx`) and imported by Task 10. `MeldAgentState`
is defined in Task 5 and used in Task 10. `AttentionItem`'s three new optional
fields (Task 7) are produced in Tasks 7–8 and consumed in Task 10.
`formatRelativeTime` is defined in Task 10 and used by both components there.

**Assumptions that were checked and corrected** before this plan was finished —
see "Verified facts that override the design doc" above: `stack.tsx` has no
`MeldHStack`/`MeldVStack`; there is no project route, so tiles open the latest
room; projects are created by a dialog, so `⌘N` opens it; there is no scratch
room, so `⇧⌘N` is unbound; `layout.test.tsx` must move with its layout.

**Still unverified, flagged at their point of use:** the props of
`ui/meld/text-input.tsx` (Task 11) and this repo's Playwright sign-in and
seeding helpers (Task 13). Both carry an explicit instruction to read the file
and match it rather than guess.

**New primitive added mid-plan:** `MeldColumnHeading` (Task 10) — needed
because feature code cannot use a raw element to lay a label and a count on one
line, and `stack.tsx` has no primitive for it.
