# Agent Thinking States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pulsing-dot-plus-static-text waiting affordance on the two agent thinking surfaces with a shared per-character wave animation driven only by real task status.

**Architecture:** A `WaveText` motion primitive in `apps/web/src/ui/` that knows nothing about AI, composed by an `AgentActivity` wrapper in `apps/web/src/features/ai/components/` that resolves labels from task status. `AgentTaskState` and `PrdGenerating` both call `AgentActivity`; neither owns motion logic. Presentation only — no repository, backend, contract, or data-loading changes.

**Tech Stack:** Next.js 16.2.11, React 19.2.4, TypeScript 5.9.3, `@astryxdesign/core` 0.1.8, Vitest 4.1.10 + jsdom + Testing Library, CSS Modules (native Next support, no new dependency).

**Spec:** `docs/superpowers/specs/2026-08-08-agent-thinking-states-design.md`

## Global Constraints

These are enforced by `pnpm check:astryx` (`scripts/check-astryx-conventions.mjs`), which scans `.ts`, `.tsx`, **and `.css`** under `apps/web/src`. Every task's requirements implicitly include this section.

- **Never write the literal `<span`** in any `.ts`/`.tsx` file. `checkSource` hard-fails on `/<span(?:\s|>)/`. Use astryx `<Text as="span">`, which renders a span and accepts `className`/`style`.
- **Never write the literal `<div`.** Same check, same rule. Use `VStack`/`HStack`.
- **No hardcoded colours** in `.tsx` or `.css` — no `#hex`, no `rgb()`/`rgba()`/`hsl()`, no bare colour keywords on colour properties. Use `var(--color-*)` or inherit.
- **No hardcoded pixels** in `.tsx` or `.css` — any `\d+px` in a style value fails. Use `em`, `var(--spacing-*)`, or unitless values.
- **No `stylex.create(`, no `xstyle=`, no `@apply`, no `@tailwind`, no `tailwindcss`.** This repo has no StyleX or Tailwind compiler.
- **Motion durations must derive from tokens** — `var(--duration-*)`, optionally inside `calc()`. No raw `ms`/`s` literals in CSS. Millisecond values computed in TSX (the stagger) are fine, because they are numbers in JavaScript rather than CSS declarations.
- **Tests must sit beside their source**, named after it (`pnpm check:test-colocation`). `wave-text.test.tsx` next to `wave-text.tsx`.
- **Node 22.23.2** (`.nvmrc`). Run `nvm use` before any command if the shell is on a different version.

Run all commands from the repo root: `/Users/maxuser/conductor/workspaces/meld/ankara`.

## File Structure

**Create:**

| File | Responsibility |
| --- | --- |
| `apps/web/src/ui/use-is-mounted.ts` | The `useSyncExternalStore` mount-deferral hook, extracted from `client-timestamp.tsx` so both it and the elapsed counter can use it. |
| `apps/web/src/ui/use-is-mounted.test.ts` | Tests for the above. |
| `apps/web/src/ui/wave-text.tsx` | The motion primitive. Splits a string into per-character astryx `Text` elements with staggered delays. No AI knowledge. |
| `apps/web/src/ui/wave-text.module.css` | The keyframes. Opacity + `translateY` only; no colour declarations at all. |
| `apps/web/src/ui/wave-text.test.tsx` | Tests for the above. |
| `apps/web/src/features/ai/components/agent-activity.tsx` | AI-facing wrapper: label resolution, elapsed counter, provider attribution, reserved slot. |
| `apps/web/src/features/ai/components/agent-activity.test.tsx` | Tests for the above. |
| `apps/web/src/features/prd/components/prd-generating.test.tsx` | New — `prd-generating.tsx` currently has no test. Locks the fabricated step list out. |

**Modify:**

| File | Change |
| --- | --- |
| `apps/web/src/ui/client-timestamp.tsx` | Import `useIsMounted` instead of defining it inline. |
| `apps/web/src/features/ai/components/agent-task-state.tsx` | Pending branch delegates to `AgentActivity`; `streamedText` and `StreamedProgress` deleted. Attention/`Banner` path untouched. |
| `apps/web/src/features/ai/components/agent-task-state.test.tsx` | Drop the two `streamedText` assertions; add `startedAt`. |
| `apps/web/src/features/discovery/components/conversation.tsx:1189-1199` | Pass `startedAt={pendingTask.createdAt}`. |
| `apps/web/src/features/prd/components/prd-generating.tsx` | `GENERATION_STEPS` deleted; header becomes one `AgentActivity`. Skeletons stay. |

**Task order:** 1 → 2 → 3 → 4 → 5. Task 3 consumes Tasks 1 and 2; Tasks 4 and 5 both consume Task 3 and are independent of each other.

---

### Task 1: Extract the `useIsMounted` hook

`client-timestamp.tsx` already contains this hook inline. `AgentActivity`'s elapsed counter needs the same server/client deferral, so it moves to its own module rather than being duplicated or re-derived.

**Files:**
- Create: `apps/web/src/ui/use-is-mounted.ts`
- Create: `apps/web/src/ui/use-is-mounted.test.ts`
- Modify: `apps/web/src/ui/client-timestamp.tsx:6-26`

**Interfaces:**
- Consumes: nothing.
- Produces: `useIsMounted(): boolean` — returns `false` during server render and the pre-hydration client pass, `true` once mounted.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/ui/use-is-mounted.test.ts`:

```ts
// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useIsMounted } from "./use-is-mounted";

it("reports mounted once rendered on the client", () => {
  // jsdom has no real SSR pass, so useSyncExternalStore resolves its client
  // snapshot immediately. This proves the hook returns the client value --
  // not that it survives an actual hydration boundary, which only the
  // browser can exercise.
  const { result } = renderHook(() => useIsMounted());

  expect(result.current).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/ui/use-is-mounted.test.ts
```

Expected: FAIL — `Failed to resolve import "./use-is-mounted"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/ui/use-is-mounted.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  // Mount state never changes after the initial client render, so there
  // is nothing to notify; useSyncExternalStore only needs a no-op.
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

// False during server render and the pre-hydration client pass, true once
// mounted. useSyncExternalStore (rather than useState + useEffect) is the
// React-recommended way to express this, since it doesn't call setState
// from inside an effect.
export function useIsMounted() {
  return useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run src/ui/use-is-mounted.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Rewrite `client-timestamp.tsx` to use the extracted hook**

Replace the entire contents of `apps/web/src/ui/client-timestamp.tsx` with:

```tsx
"use client";

import { Timestamp } from "@astryxdesign/core/Timestamp";
import { type ComponentProps } from "react";
import { useIsMounted } from "./use-is-mounted";

// Astryx's Timestamp resolves Intl.DateTimeFormat(undefined, ...) for its
// accessible label, which reads the server's Node locale during SSR and the
// browser's locale on the client. When they differ, the label text differs
// too, and React flags a hydration mismatch -- Timestamp exposes no locale
// prop to pin this at the call site. Deferring the render until after mount
// sidesteps it: server and the pre-hydration client pass both render
// nothing, and the real timestamp appears once mounted, which is the
// standard-safe pattern for a value that legitimately differs between
// server and client.
export function ClientTimestamp(props: ComponentProps<typeof Timestamp>) {
  const isMounted = useIsMounted();

  if (!isMounted) {
    return null;
  }

  return <Timestamp {...props} />;
}
```

- [ ] **Step 6: Run both test files to verify nothing regressed**

```bash
cd apps/web && pnpm vitest run src/ui/use-is-mounted.test.ts src/ui/client-timestamp.test.tsx
```

Expected: PASS (2 tests total).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/use-is-mounted.ts apps/web/src/ui/use-is-mounted.test.ts apps/web/src/ui/client-timestamp.tsx
git commit -m "refactor(ui): extract useIsMounted from ClientTimestamp

The agent activity elapsed counter needs the same server/client mount
deferral. Extracting rather than duplicating keeps one explanation of why
useSyncExternalStore is the right tool for it."
```

---

### Task 2: The `WaveText` primitive

The motion. Knows nothing about tasks, providers, or AI — it takes a string and animates it.

**Files:**
- Create: `apps/web/src/ui/wave-text.tsx`
- Create: `apps/web/src/ui/wave-text.module.css`
- Create: `apps/web/src/ui/wave-text.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `WaveText({ text, type }: WaveTextProps)` where `WaveTextProps = { text: string; type?: TextType }`, `TextType` imported from `@astryxdesign/core/Text`, `type` defaulting to `"label"`. Each character element carries `data-wave-character` and an inline `animationDelay`. The whole component is wrapped in `role="status" aria-live="polite"`.

**Background the implementer needs:**

- Astryx `Text` renders a `<span>` by default and accepts `as?: 'span' | 'p' | 'div' | 'label' | 'h1' | 'h2' | 'h3'`, plus `className`, `style`, and arbitrary `aria-*`/`data-*` rest props. Confirmed at `node_modules/@astryxdesign/core/src/Text/Text.tsx:160` and `:220`.
- `TextColor` includes `'inherit'` (`src/theme/types.ts:160-166`), so character elements inherit the surrounding colour rather than imposing one.
- `VisuallyHidden` is exported at `@astryxdesign/core/VisuallyHidden` and takes `children` plus an optional `as`.
- Vitest returns a Proxy for `.module.css` imports when CSS processing is off (the default), so `styles.character` resolves to a non-empty string in tests. **Do not assert on class-name values** — the tests below use `data-wave-character` and inline styles instead.
- `apps/web/vitest.setup.ts` stubs `matchMedia` to always return `matches: false`, so jsdom never reports reduced-motion. Reduced motion is therefore verified by CSS inspection in review, not by a unit test.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/ui/wave-text.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WaveText } from "./wave-text";

afterEach(cleanup);

function characters(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-wave-character]"),
  );
}

describe("WaveText", () => {
  it("renders one animated element per character, including spaces", () => {
    const { container } = render(<WaveText text="Ok go" />);

    // "Ok go" is five characters -- the space is animated too, otherwise the
    // wave would visibly skip between words.
    expect(characters(container)).toHaveLength(5);
  });

  it("staggers each character and caps the total lag", () => {
    // 45ms per character would put the 20th character 855ms behind the
    // first, which reads as lag rather than a wave. The cap holds every
    // character at or below 600ms.
    const { container } = render(
      <WaveText text="Waiting for your device" />,
    );
    const delays = characters(container).map(
      (element) => element.style.animationDelay,
    );

    expect(delays[0]).toBe("0ms");
    expect(delays[1]).toBe("45ms");
    expect(delays[2]).toBe("90ms");
    expect(delays.at(-1)).toBe("600ms");
    expect(delays).not.toContain("645ms");
  });

  it("announces the whole label rather than each letter", () => {
    render(<WaveText text="Responding" />);

    // The decorative characters are hidden from assistive technology, and a
    // single visually-hidden copy carries the announcement -- otherwise a
    // screen reader spells the word out letter by letter.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Responding");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("hides the decorative characters from assistive technology", () => {
    const { container } = render(<WaveText text="Queued" />);

    for (const character of characters(container)) {
      expect(character.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("keeps the same character elements when an unrelated prop changes", () => {
    // The character list is memoised on `text`. If it rebuilt on every
    // render, each animationDelay would reset and the wave would restart --
    // visibly stuttering whenever a sibling counter ticks.
    const { container, rerender } = render(
      <WaveText text="Responding" type="label" />,
    );
    const before = characters(container)[0];

    rerender(<WaveText text="Responding" type="large" />);

    expect(characters(container)[0]).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/ui/wave-text.test.tsx
```

Expected: FAIL — `Failed to resolve import "./wave-text"`.

- [ ] **Step 3: Write the CSS module**

Create `apps/web/src/ui/wave-text.module.css`:

```css
/* The wave animates opacity and transform only -- never color. That single
   decision is why one keyframe block serves both the light and dark themes:
   each character keeps whatever --color-* token it inherits and simply
   breathes. A gradient-sweep shimmer would need redefining per theme,
   because a light highlight that reads well on dark all but disappears on
   light. It also keeps this file free of any color declaration, which is
   what check-astryx-conventions scans .css files for. */

.character {
  display: inline-block;
  /* Astryx's slow band is the one its motion docs designate for continuous
     loops. Doubling its max lands at ~2.6s, in the same family as
     StatusDot's own 2s ambient pulse, without writing a raw duration. */
  animation-name: wave;
  animation-duration: calc(var(--duration-slow-max) * 2);
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}

@keyframes wave {
  0%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    /* em, not px: the lift scales with whichever Text type the caller
       picked, so the hero size and the inline size stay proportional. */
    transform: translateY(-0.08em);
  }
}

@media (prefers-reduced-motion: reduce) {
  .character {
    /* Freeze rather than slow down, following StatusDot's precedent. A
       frozen wave is simply legible text, so there is nothing that could be
       misread as broken -- unlike a frozen spinner. */
    animation-name: none;
    opacity: 0.75;
    transform: none;
  }
}
```

- [ ] **Step 4: Write the component**

Create `apps/web/src/ui/wave-text.tsx`:

```tsx
"use client";

import { Text, type TextType } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { useMemo } from "react";
import styles from "./wave-text.module.css";

const STAGGER_MS = 45;
// Past ~600ms the trailing characters read as lag rather than as a wave, so
// long labels ("Waiting for your device") clamp instead of stretching.
const MAX_STAGGER_MS = 600;

export type WaveTextProps = {
  text: string;
  type?: TextType;
};

// A label whose characters breathe in sequence. Deliberately knows nothing
// about tasks or AI -- it takes a string. Callers that need status-aware
// copy compose this from AgentActivity.
export function WaveText({ text, type = "label" }: WaveTextProps) {
  // Memoised on `text` alone: a re-render that doesn't change the string
  // must not rebuild these elements, or every animationDelay resets and the
  // wave restarts mid-cycle.
  const characters = useMemo(
    () =>
      Array.from(text).map((character, index) => ({
        // A non-breaking space keeps word gaps visible; a plain space in an
        // inline-block collapses.
        character: character === " " ? " " : character,
        delay: `${Math.min(index * STAGGER_MS, MAX_STAGGER_MS)}ms`,
      })),
    [text],
  );

  return (
    <Text as="span" type={type} role="status" aria-live="polite">
      {/* A live region announces its contents, so the plain string has to be
          present in the tree -- an aria-label on a region whose children are
          all aria-hidden would leave nothing to announce. */}
      <VisuallyHidden>{text}</VisuallyHidden>
      <Text as="span" type={type} color="inherit" aria-hidden="true">
        {characters.map(({ character, delay }, index) => (
          <Text
            as="span"
            key={index}
            type={type}
            color="inherit"
            className={styles.character}
            style={{ animationDelay: delay }}
            data-wave-character=""
          >
            {character}
          </Text>
        ))}
      </Text>
    </Text>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run src/ui/wave-text.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 6: Verify the convention checker accepts the new CSS and TSX**

```bash
pnpm check:astryx
```

Expected: exit 0, no output. If it reports `hardcoded pixel` or `raw <span> layout`, re-read the Global Constraints section — those two are the likely failures here.

- [ ] **Step 7: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors. CSS Module types come from `next-env.d.ts`; no manual declaration file is needed.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/ui/wave-text.tsx apps/web/src/ui/wave-text.module.css apps/web/src/ui/wave-text.test.tsx
git commit -m "feat(ui): add WaveText per-character wave primitive

Animates opacity and transform only, never color, so one keyframe block
serves both themes -- each character keeps the --color-* token it
inherits. Decorative characters are aria-hidden with a single
visually-hidden copy carrying the announcement, so screen readers say
'Responding' rather than spelling it out."
```

---

### Task 3: The `AgentActivity` wrapper

Resolves what to say from real task status, and owns the elapsed counter and provider attribution.

**Files:**
- Create: `apps/web/src/features/ai/components/agent-activity.tsx`
- Create: `apps/web/src/features/ai/components/agent-activity.test.tsx`

**Interfaces:**
- Consumes: `WaveText` from Task 2 (`import { WaveText } from "@/ui/wave-text"`), `useIsMounted` from Task 1 (`import { useIsMounted } from "@/ui/use-is-mounted"`).
- Produces: `AgentActivity(props: AgentActivityProps)` with

```ts
type AgentActivityProps = {
  status: AITaskStatus;
  provider?: Provider;
  kind?: "room_reply" | "prd_generate";
  startedAt?: string | null;
  size?: "inline" | "hero";
  children?: ReactNode;
};
```

Returns `null` for every status outside the four active ones.

**Background the implementer needs:**

- `AITaskStatus` (`packages/contracts/src/ai.ts:53-65`) has ten values. Only `queued`, `waiting_for_device`, `ready_to_run`, and `running` are active; the other six are settled or awaiting a user action and belong to `AgentTaskState`'s `Banner` path.
- `provider` and `startedAt` are optional because `PrdGenerating` renders during `isInitialLoading`, before any task row exists. Omit the attribution line and the counter rather than inventing either.
- Elapsed time differs between server and client render, hence `useIsMounted`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/ai/components/agent-activity.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentActivity } from "./agent-activity";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AgentActivity", () => {
  it.each([
    { status: "queued" as const, label: "Queued" },
    {
      status: "waiting_for_device" as const,
      label: "Waiting for your device",
    },
    { status: "ready_to_run" as const, label: "Starting" },
    { status: "running" as const, label: "Responding" },
  ])("labels the $status room reply", ({ status, label }) => {
    render(<AgentActivity status={status} provider="codex" />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });

  it("names PRD generation rather than a reply while running", () => {
    render(
      <AgentActivity
        status="running"
        provider="codex"
        kind="prd_generate"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Drafting your PRD");
  });

  it.each([
    "completed" as const,
    "cancelled" as const,
    "failed" as const,
    "needs_review" as const,
    "needs_reauthentication" as const,
    "usage_limit_reached" as const,
  ])("renders nothing for the settled %s status", (status) => {
    // Settled and attention states carry recovery actions and belong to
    // AgentTaskState's Banner path, not to a thinking indicator.
    const { container } = render(
      <AgentActivity status={status} provider="codex" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("attributes the running provider", () => {
    render(<AgentActivity status="running" provider="claude" />);
    expect(screen.getByText(/Claude/)).toBeVisible();
  });

  it("omits attribution when no provider is known yet", () => {
    // PrdGenerating renders during isInitialLoading, before a task row
    // exists. Inventing a provider there would be a lie.
    render(<AgentActivity status="queued" />);
    expect(screen.queryByText(/Codex|Claude/)).not.toBeInTheDocument();
  });

  it("counts elapsed time from the task's start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T10:00:12.000Z"));

    render(
      <AgentActivity
        status="running"
        provider="codex"
        startedAt="2026-08-08T10:00:00.000Z"
      />,
    );

    expect(screen.getByText("12s")).toBeVisible();
  });

  it("omits the counter when no start time is known", () => {
    render(<AgentActivity status="queued" />);
    expect(screen.queryByText(/\ds/)).not.toBeInTheDocument();
  });

  it("renders slot content beneath the label", () => {
    // The reserved seam for a future reasoning transcript. Nothing passes
    // children today; this keeps the slot from silently rotting.
    render(
      <AgentActivity status="running" provider="codex">
        <p>Reasoning would go here</p>
      </AgentActivity>,
    );
    expect(screen.getByText("Reasoning would go here")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/features/ai/components/agent-activity.test.tsx
```

Expected: FAIL — `Failed to resolve import "./agent-activity"`.

- [ ] **Step 3: Write the component**

Create `apps/web/src/features/ai/components/agent-activity.tsx`:

```tsx
"use client";

import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { AITaskStatus, Provider } from "@meld/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { useIsMounted } from "@/ui/use-is-mounted";
import { WaveText } from "@/ui/wave-text";

const PROVIDER_LABEL: Record<Provider, string> = {
  codex: "Codex",
  claude: "Claude",
};

export type AgentActivityKind = "room_reply" | "prd_generate";

// Only the four statuses a task can actually be moving through. Every other
// AITaskStatus is settled or parked awaiting a user action, and is rendered
// by AgentTaskState's Banner path instead.
const ACTIVE_LABEL: Partial<
  Record<AITaskStatus, Record<AgentActivityKind, string>>
> = {
  queued: { room_reply: "Queued", prd_generate: "Queued" },
  waiting_for_device: {
    room_reply: "Waiting for your device",
    prd_generate: "Waiting for your device",
  },
  ready_to_run: { room_reply: "Starting", prd_generate: "Starting" },
  running: {
    room_reply: "Responding",
    prd_generate: "Drafting your PRD",
  },
};

export type AgentActivityProps = {
  status: AITaskStatus;
  // Absent while PrdGenerating renders before any task row exists. The
  // attribution line is omitted rather than guessed.
  provider?: Provider;
  kind?: AgentActivityKind;
  startedAt?: string | null;
  size?: "inline" | "hero";
  // Reserved slot for a future reasoning transcript. Nothing passes
  // children today; see the design doc's "The Reserved Slot".
  children?: ReactNode;
};

function useElapsedSeconds(startedAt?: string | null) {
  const isMounted = useIsMounted();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // Elapsed time differs between the server render and the client, so it
  // stays absent until mounted rather than causing a hydration mismatch.
  if (!isMounted || !startedAt) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.floor((now - started) / 1000));
}

// The Product Agent's live thinking state. Shows only what the browser
// genuinely knows -- the task's status, its provider, and how long it has
// been running. It never claims a step it cannot observe.
export function AgentActivity({
  status,
  provider,
  kind = "room_reply",
  startedAt,
  size = "inline",
  children,
}: AgentActivityProps) {
  const elapsedSeconds = useElapsedSeconds(startedAt);
  const label = ACTIVE_LABEL[status]?.[kind];

  if (!label) {
    return null;
  }

  const providerLabel = provider ? PROVIDER_LABEL[provider] : null;

  return (
    <VStack gap={1.5} data-testid="agent-activity">
      <HStack gap={2} vAlign="center">
        <WaveText text={label} type={size === "hero" ? "large" : "label"} />
        {elapsedSeconds === null ? null : (
          <Text type="supporting" color="secondary">
            {`${elapsedSeconds}s`}
          </Text>
        )}
      </HStack>
      {providerLabel ? (
        <Text type="supporting" color="secondary">
          {status === "running"
            ? `Product Agent is responding via ${providerLabel}`
            : `Product Agent · ${providerLabel}`}
        </Text>
      ) : null}
      {children}
    </VStack>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run src/features/ai/components/agent-activity.test.tsx
```

Expected: PASS (16 tests — 4 parameterised labels, 6 parameterised settled statuses, 6 standalone).

- [ ] **Step 5: Run the convention checker and typecheck**

```bash
pnpm check:astryx && cd apps/web && pnpm typecheck
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/ai/components/agent-activity.tsx apps/web/src/features/ai/components/agent-activity.test.tsx
git commit -m "feat(ai): add AgentActivity thinking state

Drives the wave from the four statuses the browser can actually observe,
plus real elapsed time. provider and startedAt are optional so PRD
generation can render before a task row exists without inventing either.
children is the reserved seam for a future reasoning transcript."
```

---

### Task 4: Wire `AgentTaskState` to `AgentActivity` and delete `streamedText`

**Files:**
- Modify: `apps/web/src/features/ai/components/agent-task-state.tsx:29-53` (props), `:74-89` (delete `StreamedProgress`), `:112-159` (pending branch)
- Modify: `apps/web/src/features/ai/components/agent-task-state.test.tsx:50-81`
- Modify: `apps/web/src/features/discovery/components/conversation.tsx:1189-1199`

**Interfaces:**
- Consumes: `AgentActivity` from Task 3.
- Produces: `AgentTaskStateProps` loses `streamedText` and gains `startedAt?: string | null`. Every other prop is unchanged.

**Why `streamedText` goes:** it is populated only by its own test file, never in production. `features/ai/room-task-status.ts:10-14` documents the browser-visible projection as carrying "no instruction, manifest, result, or error detail", so the reasoning trace is withheld by design. Task 3's `children` slot is the single seam for that content if it ever arrives; keeping two mechanisms for it is the thing to avoid.

- [ ] **Step 1: Update the test first — delete the two `streamedText` assertions**

In `apps/web/src/features/ai/components/agent-task-state.test.tsx`, delete the whole `it("marks streamed progress text as non-authoritative", ...)` block (lines 50-66).

Then replace the `it("renders no pending UI once the task completes...")` block (lines 68-81) with:

```tsx
  it("renders no pending UI once the task completes so the persisted reply is authoritative", () => {
    const { container } = render(
      <AgentTaskState status="completed" provider="claude" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
```

Add this new test immediately after it:

```tsx
  it("shows elapsed time on the pending state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T10:00:07.000Z"));

    render(
      <AgentTaskState
        status="running"
        provider="codex"
        startedAt="2026-08-08T10:00:00.000Z"
      />,
    );

    expect(screen.getByText("7s")).toBeVisible();
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run the test to verify the new case fails**

```bash
cd apps/web && pnpm vitest run src/features/ai/components/agent-task-state.test.tsx
```

Expected: FAIL — `Unable to find an element with the text: 7s`. The deleted `streamedText` cases no longer run.

- [ ] **Step 3: Delete `StreamedProgress` and the `streamedText` prop**

In `apps/web/src/features/ai/components/agent-task-state.tsx`:

Delete the entire `StreamedProgress` function (lines 74-89).

Delete these lines from `AgentTaskStateProps` (lines 33-37):

```tsx
  // Progress text streamed while the task runs. It is NEVER the authoritative
  // reply -- the persisted Product Agent message delivered over Realtime is.
  // Shown only to reassure the room that work is happening, and always marked
  // non-authoritative so it is never mistaken for the final answer.
  streamedText?: string | null;
```

and add in their place:

```tsx
  // The task's createdAt, used only for the elapsed counter on the pending
  // state.
  startedAt?: string | null;
```

- [ ] **Step 4: Replace the pending branch with `AgentActivity`**

In the same file, replace the whole `if (pending) { ... }` block (lines 112-159) with:

```tsx
  const isPending = PENDING_STATUSES.has(status);
  if (isPending) {
    return (
      <VStack gap={1.5} data-testid="agent-task-state">
        <AgentActivity
          status={status}
          provider={provider}
          kind={taskKind}
          startedAt={startedAt}
        />
        {status === "waiting_for_device" ? (
          <HStack gap={2}>
            <Button
              variant="secondary"
              size="sm"
              label="Reconnect"
              onClick={onReconnect}
            />
            <Button
              variant="ghost"
              size="sm"
              label="Cancel"
              onClick={onCancel}
            />
          </HStack>
        ) : (
          <HStack gap={2}>
            <Button
              variant="ghost"
              size="sm"
              label="Cancel"
              onClick={onCancel}
            />
          </HStack>
        )}
      </VStack>
    );
  }
```

Replace the `PENDING_PRESENTATION` map and the `PendingPresentation` type (lines 55-72) with:

```tsx
// The statuses that mean "still moving toward a reply". Their presentation
// now lives entirely in AgentActivity; this component owns only the recovery
// actions that sit beneath it.
const PENDING_STATUSES = new Set<AITaskStatus>([
  "queued",
  "waiting_for_device",
  "ready_to_run",
  "running",
]);
```

Update the imports at the top of the file: delete the `StatusDot` import (line 19), and add:

```tsx
import { AgentActivity } from "./agent-activity";
```

Delete the now-unused `PROVIDER_LABEL` **only if** the attention path below no longer references `providerLabel` — it does still use it (lines 189-190), so **keep** `PROVIDER_LABEL` and the `const providerLabel = PROVIDER_LABEL[provider];` line.

Update the header comment block (lines 3-14) to replace the `StatusDot` bullet with:

```tsx
//   - AgentActivity -- the live queued/waiting/running thinking state.
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run src/features/ai/components/agent-task-state.test.tsx
```

Expected: PASS. All attention-state, recovery-action, and provider-naming tests still pass unchanged.

- [ ] **Step 6: Pass `startedAt` from the conversation**

In `apps/web/src/features/discovery/components/conversation.tsx`, add one prop to the `AgentTaskState` element at line 1190:

```tsx
                      <AgentTaskState
                        status={pendingTask.status}
                        provider={pendingTask.provider}
                        startedAt={pendingTask.createdAt}
                        onCancel={() =>
                          void handleCancelTask(pendingTask.taskId)
                        }
                        onReconnect={handleAgentSetupRecovery}
                        onFixConnection={handleAgentSetupRecovery}
                        onAskAgain={() => fillComposerWithQuestion(message.body)}
                      />
```

`pendingTask` is a `RoomTaskStatus`, which carries `createdAt` (`features/ai/room-task-status.ts:20`).

- [ ] **Step 7: Run the full web suite plus checks**

```bash
cd apps/web && pnpm vitest run && pnpm typecheck && cd ../.. && pnpm check:astryx
```

Expected: all pass. Watch for any other file still passing `streamedText` — there should be none.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/ai/components/agent-task-state.tsx apps/web/src/features/ai/components/agent-task-state.test.tsx apps/web/src/features/discovery/components/conversation.tsx
git commit -m "feat(ai): drive the pending reply state from AgentActivity

Replaces the pulsing StatusDot with the wave and adds a real elapsed
counter from the task's createdAt.

Deletes streamedText and StreamedProgress. The prop was populated only by
its own test -- the browser-visible task projection deliberately withholds
instruction and result detail -- and AgentActivity's children slot is now
the single seam for that content if it ever arrives."
```

---

### Task 5: Rebuild `PrdGenerating` and delete the fabricated step list

**Files:**
- Modify: `apps/web/src/features/prd/components/prd-generating.tsx:22-27` (delete `GENERATION_STEPS`), `:52-77` (header)
- Create: `apps/web/src/features/prd/components/prd-generating.test.tsx`

**Interfaces:**
- Consumes: `AgentActivity` from Task 3, `useRoomTaskStatus` from `./room-task-status-provider` (already imported by this file).
- Produces: nothing consumed by later tasks.

**Why the step list goes:** `prd-generating.tsx:63-70` renders it with `variant={index < 2 ? "accent" : "neutral"}` and `isPulsing={index === 1}`. Those indices are hardcoded, so the view claims "Gathered room context" and "Writing sections" are underway from the first frame to the last, regardless of what the task is doing. If generation stalls it keeps reporting the same two steps. The three `Skeleton` cards **stay** — content genuinely is coming, so they are an honest promise.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/prd/components/prd-generating.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PrdGenerating } from "./prd-generating";

vi.mock("./room-task-status-provider", () => ({
  useRoomTaskStatus: () => ({
    notifyQueued: vi.fn(),
    latestPrdTask: {
      taskId: "task-1",
      sourceMessageId: null,
      initiatingUserId: "user-1",
      provider: "codex" as const,
      kind: "prd_generate" as const,
      status: "running" as const,
      createdAt: "2026-08-08T10:00:00.000Z",
      updatedAt: "2026-08-08T10:00:00.000Z",
    },
  }),
}));

afterEach(cleanup);

it("shows the live generation state", () => {
  render(<PrdGenerating />);
  expect(screen.getByRole("status")).toHaveTextContent("Drafting your PRD");
});

it("claims no step it cannot observe", () => {
  // The previous implementation hardcoded which steps were "done", so it
  // reported the same two steps from the first frame to the last. The
  // browser-visible task projection carries status only -- there is no
  // per-step signal to drive these, so they must not reappear.
  render(<PrdGenerating />);

  for (const fabricated of [
    "Gathered room context",
    "Writing sections",
    "Linking decisions",
    "Finalizing",
  ]) {
    expect(screen.queryByText(fabricated)).not.toBeInTheDocument();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/features/prd/components/prd-generating.test.tsx
```

Expected: FAIL on both — no `role="status"` yet, and all four fabricated step strings are still present.

- [ ] **Step 3: Rewrite the `PrdGenerating` function**

In `apps/web/src/features/prd/components/prd-generating.tsx`, delete the `GENERATION_STEPS` constant (lines 22-27) entirely, then replace the whole `PrdGenerating` function body's JSX with:

```tsx
  const latestPrdTask = roomTaskStatus?.latestPrdTask;

  return (
    <VStack
      gap={6}
      width="100%"
      height="100%"
      paddingBlock={8}
      paddingInline={6}
      hAlign="center"
      isScrollable
    >
      <VStack gap={6} width="100%" maxWidth="calc(var(--spacing-12) * 15)">
        {/* Before the first status poll lands there is no task row yet, so
            neither the provider nor a start time is known. AgentActivity
            omits both rather than guessing. */}
        <AgentActivity
          status={latestPrdTask?.status ?? "queued"}
          provider={latestPrdTask?.provider}
          startedAt={latestPrdTask?.createdAt}
          kind="prd_generate"
          size="hero"
        />

        {[0, 1, 2].map((index) => (
          <Card key={index} width="100%" variant="muted" padding={4}>
            <VStack gap={3} width="100%">
              <Skeleton
                width={index === 0 ? "40%" : "32%"}
                height="var(--spacing-4)"
                index={index * 3}
              />
              <Skeleton
                width="100%"
                height="var(--spacing-3)"
                index={index * 3 + 1}
              />
              <Skeleton
                width="72%"
                height="var(--spacing-3)"
                index={index * 3 + 2}
              />
            </VStack>
          </Card>
        ))}
      </VStack>
    </VStack>
  );
```

Update the imports: delete `HStack` and `StatusDot` if nothing else in the file uses them (check the `PrdTabContent` function below before deleting — it uses `VStack`, `EmptyState`, and `AgentTaskState`, not `HStack`/`StatusDot`). Delete the now-unused `Text` import only if `PrdTabContent` does not use it. Add:

```tsx
import { AgentActivity } from "@/features/ai/components/agent-activity";
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run src/features/prd/components/prd-generating.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Run every check**

```bash
cd apps/web && pnpm vitest run && pnpm typecheck && pnpm lint && cd ../.. && pnpm check:astryx && pnpm check:test-colocation
```

Expected: all pass. `pnpm lint` catches any import left unused by step 3.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/prd/components/prd-generating.tsx apps/web/src/features/prd/components/prd-generating.test.tsx
git commit -m "feat(prd): replace fabricated generation steps with the live state

The step list hardcoded which steps were done -- index < 2 was always
accent, index 1 always pulsing -- so it reported the same two steps from
the first frame to the last, and kept reporting them if generation
stalled. There is no per-step signal in the browser-visible projection to
drive them honestly, so they are deleted rather than rewired.

The skeleton cards stay: content genuinely is coming, so they promise
something real."
```

---

## Final Verification

- [ ] **Run the full repo suite**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: all pass.

- [ ] **Look at it in the running app**

```bash
pnpm dev
```

Open a room, mention the Product Agent, and watch the pending bubble. Confirm: the wave runs, the counter ticks each second **without the wave stuttering or restarting**, and the label switches cleanly as the status advances. Then trigger a PRD generation and confirm the hero size reads well and no step list appears.

- [ ] **Check both themes and reduced motion**

Toggle the OS to light mode and confirm the wave is equally legible — this is the whole reason the animation targets `opacity` rather than `color`. Then enable "Reduce motion" in macOS System Settings → Accessibility → Display and confirm the label freezes into steady, legible text rather than disappearing or flickering.

## Self-Review Notes

Checked against the spec:

- **Spec coverage** — every spec section maps to a task. `WaveText` → Task 2. `AgentActivity` → Task 3. States and labels table → Task 3 Step 3. Elapsed timer and its separation from the wave → Task 3 (`useElapsedSeconds`, rendered as a sibling `Text`). Motion → Task 2 Step 3. Accessibility → Task 2 Steps 3-4. Reserved slot → Task 3 (`children`). Deletions → Tasks 4 and 5. Consuming surfaces → Tasks 4 and 5. Testing → each task's test step, plus Final Verification. Files list → File Structure table.
- **Type consistency** — `AgentActivityProps` is defined once in Task 3 and consumed with the same names in Tasks 4 and 5. `WaveTextProps` is defined in Task 2 and consumed in Task 3. `useIsMounted` is defined in Task 1 and consumed in Tasks 1 and 3. `PENDING_STATUSES` (Task 4) and `ACTIVE_LABEL` (Task 3) list the same four statuses.
- **Out of scope, deliberately** — `provider-setup-progress.tsx`, `ai-connection-setup.tsx`, and the home spinners keep their current treatment. Scope is agent thinking only.
- **Known follow-up, not in this plan** — `apps/web/package.json` pins `@types/node` to `20.19.43`, which trails the 22.23.2 runtime after the toolchain bump. It affects every package rather than this feature and wants its own change.
