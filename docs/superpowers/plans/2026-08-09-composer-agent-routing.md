# Composer Agent Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the composer's stacking provider `Selector`, research-sources `SegmentedControl`, and not-connected `Banner` with two quiet chips in the toolbar row that never change the composer's height and always state which AI will answer.

**Architecture:** A pure resolution function turns (readiness, sticky override) into one `AgentRouting`; a `localStorage` store persists the override per room; a presentational `ComposerChip` wraps the design system's `DropdownMenu`; two thin mappers (`AgentRoutingChip`, `ResearchScopeChip`) render into the composer's existing `footerActions` row. Phase 1 changes no contract, no RPC, and no connector code — `providerOverride` reaches the server exactly as it does today.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Vitest + Testing Library (jsdom), Playwright, `@astryxdesign/core` 0.1.8, Zod 4 via `@meld/contracts`.

**Spec:** `docs/superpowers/specs/2026-08-09-composer-agent-routing-design.md`

## Global Constraints

- **No literal colours or pixel values in inline styles.** `pnpm check:astryx` fails the build on `color`/`background`/`borderRadius`/`fontSize`/etc. holding a literal. Use design tokens (`var(--color-*)`, `var(--spacing-*)`) or, preferably, design-system component props. Every chip tone in this plan is expressed as a `Button` `variant`, so no custom colour CSS is needed anywhere.
- **Tests are colocated.** `pnpm check:test-colocation` requires `foo.test.ts(x)` to sit beside `foo.ts(x)` in `apps/web`. Never create a `__tests__` directory.
- **Run web unit tests with:** `cd apps/web && pnpm exec vitest run <path>` (single file) — the suite is `vitest run --passWithNoTests`.
- **Run e2e with:** `pnpm test:e2e` from the repo root (Playwright, `testDir: ./e2e`, single worker).
- **Client components need `"use client"`** as the first line, matching the other files in `apps/web/src/features/discovery/components/`.
- **The resolved provider must always be one `create_room_reply_task` accepts** — i.e. always a member of `readiness.providers`. Never send a provider that is not currently runnable on the default device.
- **Routing swaps the provider only, never the device.**
- **Phase 1 populates only `provider`.** `accountId` and `model` exist in the type and are never set or persisted yet.
- Preserve the existing `data-testid` values `agent-provider-picker` and `agent-not-ready` on their replacements, so the many call sites in `conversation.test.tsx` and `composer.submission.test.tsx` keep working.

---

### Task 1: Routing resolution (pure)

The single place that decides which provider will actually answer. Pure — no React, no storage.

**Files:**
- Create: `apps/web/src/features/discovery/components/routing-model.ts`
- Test: `apps/web/src/features/discovery/components/routing-model.test.ts`

**Interfaces:**
- Consumes: `Provider` from `@meld/contracts`; `AgentReadiness` from `@/features/ai/agent-readiness`.
- Produces: `type AgentRouting = { provider: Provider; accountId?: string; model?: string }` and `resolveEffectiveRouting(readiness: AgentReadiness | undefined, override: AgentRouting | undefined): AgentRouting | undefined`. Tasks 2, 4, 6, 7 all import both.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/discovery/components/routing-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { resolveEffectiveRouting } from "./routing-model";

const DEVICE_ID = "d0000000-0000-4000-8000-000000000000";

const READY: AgentReadiness = {
  ready: true,
  defaultProvider: "codex",
  defaultDeviceId: DEVICE_ID,
  providers: [
    { provider: "codex", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
    { provider: "claude", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
  ],
};

describe("resolveEffectiveRouting", () => {
  it("prefers a sticky override that is still runnable", () => {
    expect(
      resolveEffectiveRouting(READY, { provider: "claude" }),
    ).toEqual({ provider: "claude" });
  });

  it("falls back to the saved default when there is no override", () => {
    expect(resolveEffectiveRouting(READY, undefined)).toEqual({
      provider: "codex",
    });
  });

  it("drops a stale override whose provider is no longer runnable", () => {
    const onlyCodex: AgentReadiness = {
      ...READY,
      providers: [READY.providers[0]],
    };

    // The user picked Claude in this room, then signed Claude out. What will
    // really answer is Codex, and that is what the chip must say.
    expect(
      resolveEffectiveRouting(onlyCodex, { provider: "claude" }),
    ).toEqual({ provider: "codex" });
  });

  it("falls back to the first ready provider when the saved default is not runnable", () => {
    const claudeOnly: AgentReadiness = {
      ...READY,
      defaultProvider: "codex",
      providers: [READY.providers[1]],
    };

    expect(resolveEffectiveRouting(claudeOnly, undefined)).toEqual({
      provider: "claude",
    });
  });

  it("resolves nothing while readiness is loading or not ready", () => {
    expect(resolveEffectiveRouting(undefined, { provider: "claude" })).toBeUndefined();
    expect(
      resolveEffectiveRouting({ ready: false, reason: "no_device" }, undefined),
    ).toBeUndefined();
  });

  it("never resolves a provider outside the runnable set", () => {
    for (const override of [undefined, { provider: "claude" as const }]) {
      const resolved = resolveEffectiveRouting(READY, override);
      expect(
        READY.providers.some((c) => c.provider === resolved?.provider),
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/routing-model.test.ts`
Expected: FAIL — cannot resolve `./routing-model`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/features/discovery/components/routing-model.ts`:

```ts
import type { Provider } from "@meld/contracts";
import type { AgentReadiness } from "@/features/ai/agent-readiness";

// What the send actually forwards. `accountId` and `model` are reserved: the
// multi-account work fills the first, phase 2 (model selection) fills the
// second. Phase 1 never sets either, but every consumer already speaks this
// shape so neither addition is a rewrite.
export type AgentRouting = {
  provider: Provider;
  accountId?: string;
  model?: string;
};

// Resolve the routing a send will really use. This mirrors, deliberately, the
// invariant `resolveAgentReadiness` already enforces: the resolved provider is
// always one `create_room_reply_task` will accept. A sticky override whose
// provider has since been signed out, uninstalled, or unpaired is dropped here
// rather than shown -- the chip must never promise a reply the RPC would then
// refuse.
export function resolveEffectiveRouting(
  readiness: AgentReadiness | undefined,
  override: AgentRouting | undefined,
): AgentRouting | undefined {
  if (readiness?.ready !== true) {
    return undefined;
  }

  const isOverrideRunnable = readiness.providers.some(
    (candidate) => candidate.provider === override?.provider,
  );
  if (override && isOverrideRunnable) {
    return override;
  }

  // readiness.providers is non-empty whenever ready is true (resolveAgentReadiness
  // returns not-ready on an empty set), so the fallback always finds a provider.
  const saved = readiness.providers.find(
    (candidate) => candidate.provider === readiness.defaultProvider,
  );
  return { provider: (saved ?? readiness.providers[0]).provider };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/routing-model.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/discovery/components/routing-model.ts apps/web/src/features/discovery/components/routing-model.test.ts
git commit -m "feat(discovery): resolve which provider a send will really use"
```

---

### Task 2: Room routing store

Persists the sticky override per room. `localStorage`, not `sessionStorage`: the override has to survive a tab close.

**Files:**
- Create: `apps/web/src/features/discovery/components/room-routing-store.ts`
- Test: `apps/web/src/features/discovery/components/room-routing-store.test.ts`

**Interfaces:**
- Consumes: `AgentRouting` from Task 1; `ProviderSchema` from `@meld/contracts`.
- Produces: `roomRoutingStorageKey(roomId: string): string`, `parseRoomRouting(raw: string | null): AgentRouting | undefined`, `serializeRoomRouting(routing: AgentRouting): string`, `readRoomRouting(roomId: string): AgentRouting | undefined`, `writeRoomRouting(roomId: string, routing: AgentRouting): void`. Task 7 uses `readRoomRouting` / `writeRoomRouting`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/discovery/components/room-routing-store.test.ts`:

```ts
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseRoomRouting,
  readRoomRouting,
  roomRoutingStorageKey,
  serializeRoomRouting,
  writeRoomRouting,
} from "./room-routing-store";

const ROOM_ID = "20000000-0000-4000-8000-000000000002";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("roomRoutingStorageKey", () => {
  it("scopes the key to one room, matching the draft key convention", () => {
    expect(roomRoutingStorageKey(ROOM_ID)).toBe(
      `discovery-routing:${ROOM_ID}`,
    );
  });
});

describe("parseRoomRouting", () => {
  it("accepts a known provider", () => {
    expect(parseRoomRouting('{"provider":"claude"}')).toEqual({
      provider: "claude",
    });
  });

  it("rejects an unknown provider rather than propagating it", () => {
    expect(parseRoomRouting('{"provider":"gpt-9"}')).toBeUndefined();
  });

  it("rejects malformed and empty input", () => {
    expect(parseRoomRouting("not json")).toBeUndefined();
    expect(parseRoomRouting("[]")).toBeUndefined();
    expect(parseRoomRouting(null)).toBeUndefined();
  });
});

describe("read/write round trip", () => {
  it("returns what was written", () => {
    writeRoomRouting(ROOM_ID, { provider: "claude" });
    expect(readRoomRouting(ROOM_ID)).toEqual({ provider: "claude" });
  });

  it("persists only the provider in phase 1", () => {
    writeRoomRouting(ROOM_ID, {
      provider: "codex",
      accountId: "not-yet-supported",
      model: "not-yet-supported",
    });
    expect(
      window.localStorage.getItem(roomRoutingStorageKey(ROOM_ID)),
    ).toBe(serializeRoomRouting({ provider: "codex" }));
  });

  it("keeps rooms independent", () => {
    writeRoomRouting(ROOM_ID, { provider: "claude" });
    expect(readRoomRouting("30000000-0000-4000-8000-000000000003")).toBeUndefined();
  });
});

describe("hostile storage", () => {
  it("degrades to no override when reading throws", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readRoomRouting(ROOM_ID)).toBeUndefined();
  });

  it("swallows a write that throws, because persistence is a convenience", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeRoomRouting(ROOM_ID, { provider: "claude" })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/room-routing-store.test.ts`
Expected: FAIL — cannot resolve `./room-routing-store`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/features/discovery/components/room-routing-store.ts`:

```ts
import { ProviderSchema } from "@meld/contracts";
import type { AgentRouting } from "./routing-model";

// The room-sticky routing override, persisted to localStorage rather than the
// sessionStorage the draft uses (composer-model.ts:507): sessionStorage dies
// with the tab, and this choice is meant to hold until the user changes it
// back. It is personal and per-room, so it stays on the client; a DB row is the
// upgrade path if it should ever follow a user across devices.
export function roomRoutingStorageKey(roomId: string): string {
  return `discovery-routing:${roomId}`;
}

// Untrusted storage input never becomes a dispatched provider: only a value the
// contract's own enum accepts survives. Anything else is discarded, which the
// caller treats as "no override" and therefore falls back to the saved default.
export function parseRoomRouting(
  raw: string | null,
): AgentRouting | undefined {
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const provider = ProviderSchema.safeParse(
    (parsed as Record<string, unknown>).provider,
  );
  return provider.success ? { provider: provider.data } : undefined;
}

// Phase 1 writes only the provider. accountId and model are deliberately not
// persisted: nothing sets them yet, and persisting an empty field would invite
// a half-migrated value later.
export function serializeRoomRouting(routing: AgentRouting): string {
  return JSON.stringify({ provider: routing.provider });
}

export function readRoomRouting(roomId: string): AgentRouting | undefined {
  try {
    return parseRoomRouting(
      window.localStorage.getItem(roomRoutingStorageKey(roomId)),
    );
  } catch {
    // Private mode and disabled-storage browsers throw on access. The composer
    // stays fully usable on the saved default.
    return undefined;
  }
}

export function writeRoomRouting(
  roomId: string,
  routing: AgentRouting,
): void {
  try {
    window.localStorage.setItem(
      roomRoutingStorageKey(roomId),
      serializeRoomRouting(routing),
    );
  } catch {
    // Persistence is a convenience, never a dependency: a failed write leaves
    // the in-memory choice working for this session.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/room-routing-store.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/discovery/components/room-routing-store.ts apps/web/src/features/discovery/components/room-routing-store.test.ts
git commit -m "feat(discovery): persist a room's routing override across tabs"
```

---

### Task 3: `ComposerChip` presentational primitive

One chip: a quiet menu button. Tone is expressed purely as a `Button` variant, so no custom colour CSS exists and `pnpm check:astryx` has nothing to reject.

**Files:**
- Create: `apps/web/src/features/discovery/components/composer-chip.tsx`
- Test: `apps/web/src/features/discovery/components/composer-chip.test.tsx`

**Interfaces:**
- Consumes: `DropdownMenu` and `Button` from `@astryxdesign/core`.
- Produces: `type ComposerChipTone = "rest" | "active" | "warning"` and `ComposerChip({ label, tone, menuLabel, testId, isInert, children })`. Tasks 4 and 5 render it.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/discovery/components/composer-chip.test.tsx`:

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { ComposerChip } from "./composer-chip";

function renderChip(props: Partial<Parameters<typeof ComposerChip>[0]> = {}) {
  return render(
    <ComposerChip
      label="Claude"
      tone="rest"
      menuLabel="Answer with"
      testId="chip"
      {...props}
    >
      <DropdownMenuRadioGroup
        aria-label="Answer with"
        value="claude"
        onChange={() => {}}
      >
        <DropdownMenuRadioItem value="claude" label="Claude" />
        <DropdownMenuRadioItem value="codex" label="Codex" />
      </DropdownMenuRadioGroup>
    </ComposerChip>,
  );
}

describe("ComposerChip", () => {
  it("renders its current value as the accessible name of a button", () => {
    renderChip();
    expect(
      screen.getByRole("button", { name: /Claude/ }),
    ).toBeInTheDocument();
  });

  it("opens its menu on click", async () => {
    const user = userEvent.setup();
    renderChip();

    await user.click(screen.getByRole("button", { name: /Claude/ }));

    expect(
      screen.getByRole("menuitemradio", { name: "Codex" }),
    ).toBeInTheDocument();
  });

  it("stays interactive at rest -- dim is a tone, not a disabled state", () => {
    renderChip({ tone: "rest" });
    expect(screen.getByRole("button", { name: /Claude/ })).toBeEnabled();
  });

  it("renders an inert, unopenable chip while readiness is loading", async () => {
    const user = userEvent.setup();
    renderChip({ isInert: true, label: "AI" });

    const chip = screen.getByRole("button", { name: /AI/ });
    expect(chip).toBeDisabled();
    await user.click(chip);
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/composer-chip.test.tsx`
Expected: FAIL — cannot resolve `./composer-chip`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/features/discovery/components/composer-chip.tsx`:

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import type { ReactNode } from "react";

// The chip's three tones map onto Button variants rather than custom colour, so
// the whole control is themed by the design system and the repo's no-literal-
// colour check has nothing to inspect.
//
//   rest    -- the agent is not addressed in this draft. A quiet statement of
//              fact ("if you call an agent, this answers"). Still clickable.
//   active  -- the draft addresses an agent; the chip gains weight.
//   warning -- nothing is connected; paired with words, never colour alone.
export type ComposerChipTone = "rest" | "active" | "warning";

const TONE_VARIANT = {
  rest: "ghost",
  active: "secondary",
  warning: "secondary",
} as const;

const CHIP_MENU_WIDTH = "calc(var(--spacing-12) * 3)";

export function ComposerChip({
  label,
  tone,
  menuLabel,
  testId,
  isInert = false,
  children,
}: {
  label: string;
  tone: ComposerChipTone;
  // Prefixes the button's accessible name so the chip announces what the value
  // means, not just the value: "Answer with: Claude".
  menuLabel: string;
  testId: string;
  // Readiness has not resolved yet. The chip must claim no provider and must
  // not open a menu over a set we do not know.
  isInert?: boolean;
  children?: ReactNode;
}) {
  const accessibleName = `${menuLabel}: ${label}`;

  if (isInert) {
    return (
      <Button
        label={accessibleName}
        variant={TONE_VARIANT[tone]}
        size="sm"
        isDisabled
        data-testid={testId}
      />
    );
  }

  return (
    <DropdownMenu
      data-testid={testId}
      hasChevron
      menuWidth={CHIP_MENU_WIDTH}
      button={{
        label: accessibleName,
        variant: TONE_VARIANT[tone],
        size: "sm",
      }}
    >
      {children}
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/composer-chip.test.tsx`
Expected: PASS — 4 tests.

If the accessible-name assertions fail because `DropdownMenu` renders the label differently than expected, read `node_modules/@astryxdesign/core/dist/DropdownMenu/DropdownMenu.js` to see how `button.label` reaches the DOM and adjust the component (not the test's intent) so the current value is part of the button's accessible name.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/discovery/components/composer-chip.tsx apps/web/src/features/discovery/components/composer-chip.test.tsx
git commit -m "feat(discovery): add the composer's quiet menu chip"
```

---

### Task 4: `AgentRoutingChip`

Maps readiness plus resolved routing onto a chip. This is where the state table from the spec lives.

**Files:**
- Create: `apps/web/src/features/discovery/components/agent-routing-chip.tsx`
- Test: `apps/web/src/features/discovery/components/agent-routing-chip.test.tsx`

**Interfaces:**
- Consumes: `ComposerChip`, `ComposerChipTone` (Task 3); `AgentRouting` (Task 1); `AgentReadiness`; `Provider`.
- Produces: `AgentRoutingChip({ readiness, routing, isAgentAddressed, onChoose, onConnect })` where `onChoose: (provider: Provider) => void` and `onConnect: () => void`. Task 6 renders it.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/discovery/components/agent-routing-chip.test.tsx`:

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { AgentRoutingChip } from "./agent-routing-chip";

const DEVICE_ID = "d0000000-0000-4000-8000-000000000000";

const READY: AgentReadiness = {
  ready: true,
  defaultProvider: "codex",
  defaultDeviceId: DEVICE_ID,
  providers: [
    { provider: "codex", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
    { provider: "claude", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
  ],
};

const CODEX_ONLY: AgentReadiness = {
  ...READY,
  providers: [READY.providers[0]],
};

function renderChip(props: Partial<Parameters<typeof AgentRoutingChip>[0]> = {}) {
  const onChoose = vi.fn();
  const onConnect = vi.fn();
  render(
    <AgentRoutingChip
      readiness={READY}
      routing={{ provider: "codex" }}
      isAgentAddressed={false}
      onChoose={onChoose}
      onConnect={onConnect}
      {...props}
    />,
  );
  return { onChoose, onConnect, user: userEvent.setup() };
}

describe("AgentRoutingChip", () => {
  it("is present with no agent mention in the draft", () => {
    renderChip({ isAgentAddressed: false });
    // The whole point of the redesign: the row never gains or loses a control.
    expect(screen.getByTestId("agent-provider-picker")).toBeInTheDocument();
  });

  it("is present when an agent is addressed", () => {
    renderChip({ isAgentAddressed: true });
    expect(screen.getByTestId("agent-provider-picker")).toBeInTheDocument();
  });

  it("names the provider that will answer", () => {
    renderChip({ routing: { provider: "claude" } });
    expect(
      screen.getByRole("button", { name: /Claude/ }),
    ).toBeInTheDocument();
  });

  it("reports the chosen provider", async () => {
    const { onChoose, user } = renderChip();

    await user.click(screen.getByRole("button", { name: /Codex/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Claude" }));

    expect(onChoose).toHaveBeenCalledWith("claude");
  });

  it("still shows a chip with a single ready provider, and offers a way forward", async () => {
    const { user } = renderChip({ readiness: CODEX_ONLY });

    // The old Selector hid itself here, leaving the author with no statement of
    // who answers and no route to adding another provider.
    const chip = screen.getByTestId("agent-provider-picker");
    expect(chip).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Codex/ }));
    expect(
      screen.getByRole("menuitem", { name: /Connect another provider/ }),
    ).toBeInTheDocument();
  });

  it("becomes a connect prompt when nothing is connected", async () => {
    const { onConnect, user } = renderChip({
      readiness: { ready: false, reason: "no_device" },
      routing: undefined,
      isAgentAddressed: true,
    });

    await user.click(screen.getByRole("button", { name: /Connect AI/ }));
    await user.click(screen.getByRole("menuitem", { name: /Connect your AI/ }));

    expect(onConnect).toHaveBeenCalled();
  });

  it("claims no provider while readiness is loading", () => {
    renderChip({ readiness: undefined, routing: undefined });

    const chip = screen.getByRole("button", { name: /AI/ });
    expect(chip).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Codex/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/agent-routing-chip.test.tsx`
Expected: FAIL — cannot resolve `./agent-routing-chip`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/features/discovery/components/agent-routing-chip.tsx`:

```tsx
"use client";

import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import type { Provider } from "@meld/contracts";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { ComposerChip, type ComposerChipTone } from "./composer-chip";
import type { AgentRouting } from "./routing-model";

const PROVIDER_LABEL: Record<Provider, string> = {
  codex: "Codex",
  claude: "Claude",
};

const MENU_LABEL = "Answer with";

// The chip is always rendered; only its tone, label, and menu change. Nothing
// here may return null -- a control that comes and goes is the layout jolt this
// design exists to remove.
export function AgentRoutingChip({
  readiness,
  routing,
  isAgentAddressed,
  onChoose,
  onConnect,
}: {
  readiness: AgentReadiness | undefined;
  routing: AgentRouting | undefined;
  // Whether the current draft addresses an agent. Drives weight only.
  isAgentAddressed: boolean;
  onChoose: (provider: Provider) => void;
  onConnect: () => void;
}) {
  const tone: ComposerChipTone = isAgentAddressed ? "active" : "rest";

  // Readiness has not resolved. Claim nothing.
  if (readiness === undefined || routing === undefined) {
    if (readiness?.ready === false) {
      return (
        <ComposerChip
          label="Connect AI"
          // Amber only once an agent is actually addressed. Warning someone
          // about an AI they never asked for would be noise on a note to a
          // teammate.
          tone={isAgentAddressed ? "warning" : "rest"}
          menuLabel={MENU_LABEL}
          testId="agent-provider-picker"
        >
          <DropdownMenuItem label="Connect your AI →" onClick={onConnect} />
        </ComposerChip>
      );
    }

    return (
      <ComposerChip
        label="AI"
        tone="rest"
        menuLabel={MENU_LABEL}
        testId="agent-provider-picker"
        isInert
      />
    );
  }

  const providers = readiness.ready === true ? readiness.providers : [];

  return (
    <ComposerChip
      label={PROVIDER_LABEL[routing.provider]}
      tone={tone}
      menuLabel={MENU_LABEL}
      testId="agent-provider-picker"
    >
      <DropdownMenuRadioGroup
        aria-label={MENU_LABEL}
        value={routing.provider}
        onChange={(next) => onChoose(next as Provider)}
      >
        {providers.map((candidate) => (
          <DropdownMenuRadioItem
            key={candidate.provider}
            value={candidate.provider}
            label={PROVIDER_LABEL[candidate.provider]}
          />
        ))}
      </DropdownMenuRadioGroup>
      {providers.length === 1 ? (
        <DropdownMenuItem
          label="Connect another provider…"
          onClick={onConnect}
        />
      ) : null}
    </ComposerChip>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/agent-routing-chip.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/discovery/components/agent-routing-chip.tsx apps/web/src/features/discovery/components/agent-routing-chip.test.tsx
git commit -m "feat(discovery): state which AI answers in one always-present chip"
```

---

### Task 5: `ResearchScopeChip`

The second dimension, as its own chip. "Web + room" spends real time and reaches outside the company, so it is legible before send rather than one click inside a menu.

**Files:**
- Create: `apps/web/src/features/discovery/components/research-scope-chip.tsx`
- Test: `apps/web/src/features/discovery/components/research-scope-chip.test.tsx`

**Interfaces:**
- Consumes: `ComposerChip` (Task 3); `ResearchScope` from `@meld/contracts`.
- Produces: `ResearchScopeChip({ scope, onChange })` where `onChange: (scope: ResearchScope) => void`. Task 6 renders it.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/discovery/components/research-scope-chip.test.tsx`:

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResearchScopeChip } from "./research-scope-chip";

describe("ResearchScopeChip", () => {
  it("names the sources the Research Agent may read", () => {
    render(<ResearchScopeChip scope="room" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Room only/ }),
    ).toBeInTheDocument();
  });

  it("says plainly when the web is in scope", () => {
    render(<ResearchScopeChip scope="web" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Web \+ room/ }),
    ).toBeInTheDocument();
  });

  it("reports a change of sources", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ResearchScopeChip scope="room" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Room only/ }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Web + room" }),
    );

    expect(onChange).toHaveBeenCalledWith("web");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/research-scope-chip.test.tsx`
Expected: FAIL — cannot resolve `./research-scope-chip`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/features/discovery/components/research-scope-chip.tsx`:

```tsx
"use client";

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import type { ResearchScope } from "@meld/contracts";
import { ComposerChip } from "./composer-chip";

const SCOPE_LABEL: Record<ResearchScope, string> = {
  room: "Room only",
  web: "Web + room",
};

const MENU_LABEL = "Research sources";

// Rendered only while the Research Agent is addressed -- unlike the routing
// chip, this dimension does not exist for other agents, and inventing a resting
// state for it would state something untrue.
export function ResearchScopeChip({
  scope,
  onChange,
}: {
  scope: ResearchScope;
  onChange: (scope: ResearchScope) => void;
}) {
  return (
    <ComposerChip
      label={SCOPE_LABEL[scope]}
      tone="active"
      menuLabel={MENU_LABEL}
      testId="research-scope-picker"
    >
      <DropdownMenuRadioGroup
        aria-label={MENU_LABEL}
        value={scope}
        onChange={(next) => onChange(next as ResearchScope)}
      >
        <DropdownMenuRadioItem value="room" label={SCOPE_LABEL.room} />
        <DropdownMenuRadioItem value="web" label={SCOPE_LABEL.web} />
      </DropdownMenuRadioGroup>
    </ComposerChip>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/research-scope-chip.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/discovery/components/research-scope-chip.tsx apps/web/src/features/discovery/components/research-scope-chip.test.tsx
git commit -m "feat(discovery): show research sources before the send, not inside a menu"
```

---

### Task 6: Move the controls into the toolbar row

Delete the three stacking blocks; render the chips in `footerActions`; replace the `Banner` with one line in a live region.

**Files:**
- Modify: `apps/web/src/features/discovery/components/composer.tsx` (remove lines currently at `454-503`; add to the `footerActions` `HStack` currently at `506-552`)
- Modify: `apps/web/src/features/discovery/components/composer.submission.test.tsx:122-161` (two tests encode the *old* hiding behaviour and must be inverted)

**Interfaces:**
- Consumes: `AgentRoutingChip` (Task 4), `ResearchScopeChip` (Task 5), `resolveEffectiveRouting` (Task 1).
- Produces: nothing new. `submit` still sends `providerOverride` exactly as before.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/features/discovery/components/composer.submission.test.tsx`, inside the existing `describe("DiscoveryComposer submission", ...)`:

```tsx
  it("keeps the routing chip in place whether or not an agent is addressed", async () => {
    const { user } = renderComposer({
      value: "Just a note for the team",
      agentReadiness: READY_AGENT,
    });

    // The row must not gain or lose a control as the draft changes -- that
    // reflow is the whole reason the picker moved out of the input column.
    expect(screen.getByTestId("agent-provider-picker")).toBeVisible();

    await user.click(screen.getByRole("combobox", { name: "Message" }));
    await user.keyboard(" @Product Agent");

    expect(screen.getByTestId("agent-provider-picker")).toBeVisible();
  });

  it("shows a single quiet line instead of a banner block when nothing is connected", () => {
    renderComposer({
      value: "Ask @Product Agent for signals",
      agentReadiness: { ready: false, reason: "no_device" },
      onConnectPersonalAI: vi.fn(),
    });

    const prompt = screen.getByTestId("agent-not-ready");
    expect(prompt).toBeVisible();
    // Losing the Banner loses a status region, so the sentence must still
    // reach a screen reader when a mention completes.
    expect(prompt).toHaveAttribute("role", "status");
  });

  it("shows the research sources chip only for a Research Agent mention", async () => {
    const { user } = renderComposer({
      value: "Ask @Product Agent to synthesize",
      agentReadiness: READY_AGENT,
    });

    expect(screen.queryByTestId("research-scope-picker")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("combobox", { name: "Message" }));
    await user.keyboard("@Research Agent find comparables");

    expect(await screen.findByTestId("research-scope-picker")).toBeVisible();
  });
```

Then **replace** the two tests at `composer.submission.test.tsx:122-161` — `"hides the provider picker when only one provider is ready"` and `"hides the provider picker when the draft has no Product Agent mention"` — with these, which assert the new intent:

```tsx
  it("shows a chip rather than nothing when only one provider is ready", () => {
    renderComposer({
      value: "Ask @Product Agent to synthesize",
      agentReadiness: {
        ready: true,
        defaultProvider: "codex",
        defaultDeviceId: "d0000000-0000-4000-8000-000000000000",
        providers: [
          {
            provider: "codex",
            deviceId: "d0000000-0000-4000-8000-000000000000",
            deviceName: "Ada's MacBook",
          },
        ],
      },
    });

    // A one-option dropdown was a non-choice, so the old Selector hid itself --
    // and with it, any statement of who would answer. The chip stays: it is
    // informative even when it is not a choice, and its menu offers a way to
    // add a second provider.
    expect(screen.getByTestId("agent-provider-picker")).toBeVisible();
    expect(screen.queryByTestId("agent-not-ready")).not.toBeInTheDocument();
  });

  it("keeps the chip and shows no connect prompt when the draft has no agent mention", () => {
    renderComposer({
      value: "Just a note for the team",
      agentReadiness: READY_AGENT,
    });

    expect(screen.getByTestId("agent-provider-picker")).toBeVisible();
    expect(screen.queryByTestId("agent-not-ready")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/composer.submission.test.tsx`
Expected: FAIL — the chip is not rendered when no agent is addressed; `research-scope-picker` does not exist; `agent-not-ready` is still a `Banner` without `role="status"`.

- [ ] **Step 3: Write minimal implementation**

In `composer.tsx`, **delete** the research `SegmentedControl`, the provider `Selector`, and the `Banner` (currently `454-503`), leaving the input `VStack` with the attachments, the `ChatComposerInput`, and this one line:

```tsx
            {draftAgentKind && agentReadiness?.ready === false ? (
              <Text type="supporting" color="secondary" role="status" data-testid="agent-not-ready">
                No AI connected — press Send to connect yours and keep this draft.
              </Text>
            ) : null}
```

Then add the chips to the `footerActions` `HStack`, after the existing `@` `IconButton` and before its closing tag:

```tsx
            {draftAgentKind === "research" ? (
              <ResearchScopeChip
                scope={researchScope}
                onChange={setResearchScope}
              />
            ) : null}
            <AgentRoutingChip
              readiness={agentReadiness}
              routing={effectiveRouting}
              isAgentAddressed={draftAgentKind !== undefined}
              onChoose={setSelectedProvider}
              onConnect={handleConnectPersonalAI}
            />
```

Replace the inline `effectiveProvider` ternary (currently `153-160`) with the shared resolver, keeping `effectiveProvider` as the name `submit` already uses:

```tsx
  const effectiveRouting = resolveEffectiveRouting(
    agentReadiness,
    selectedProvider ? { provider: selectedProvider } : undefined,
  );
  const effectiveProvider = effectiveRouting?.provider;
```

Update the imports at the top of the file:

- **Drop** `Banner`, `Selector`, `SegmentedControl`, `SegmentedControlItem`, and `Button` — `Button` appears exactly once, at line `495` inside the `Banner` being deleted, so its import goes too or lint fails on an unused import.
- **Drop** the local `PROVIDER_LABEL` constant (currently at lines `50-53`); it now lives in `agent-routing-chip.tsx`.
- **Keep** `Text` — already imported at line `18` and now used by the connect prompt.
- **Add:**

```tsx
import { AgentRoutingChip } from "./agent-routing-chip";
import { ResearchScopeChip } from "./research-scope-chip";
import { resolveEffectiveRouting } from "./routing-model";
```

- [ ] **Step 4: Run the full composer + conversation suites**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/`
Expected: PASS. `conversation.test.tsx` (lines 790, 875, 1276) awaits `agent-provider-picker`, which still exists and is now present more often, so those keep passing untouched.

Then run the repo's convention checks, which this task can plausibly break:

Run: `pnpm check:astryx && pnpm check:test-colocation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/discovery/components/composer.tsx apps/web/src/features/discovery/components/composer.submission.test.tsx
git commit -m "feat(discovery): still the composer by moving routing into the toolbar row"
```

---

### Task 7: Make the override stick to the room

Until now the choice lives in component state and dies on unmount. This gives it a home.

**Files:**
- Create: `apps/web/src/features/discovery/components/use-room-routing.ts`
- Create: `apps/web/src/features/discovery/components/use-room-routing.test.tsx`
- Modify: `apps/web/src/features/discovery/components/composer.tsx` (accept `roomId`, replace `selectedProvider` state)
- Modify: `apps/web/src/features/discovery/components/conversation.tsx:1078` area (pass `roomId`)
- Modify: `apps/web/src/features/discovery/components/composer-test-harness.tsx` (thread `roomId` through `renderComposer`)

**Interfaces:**
- Consumes: `readRoomRouting` / `writeRoomRouting` (Task 2); `resolveEffectiveRouting` (Task 1).
- Produces: `useRoomRouting({ roomId, readiness, initialProviderOverride }): { routing: AgentRouting | undefined; choose: (provider: Provider) => void }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/discovery/components/use-room-routing.test.tsx`:

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { readRoomRouting, writeRoomRouting } from "./room-routing-store";
import { useRoomRouting } from "./use-room-routing";

const ROOM_ID = "20000000-0000-4000-8000-000000000002";
const DEVICE_ID = "d0000000-0000-4000-8000-000000000000";

const READY: AgentReadiness = {
  ready: true,
  defaultProvider: "codex",
  defaultDeviceId: DEVICE_ID,
  providers: [
    { provider: "codex", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
    { provider: "claude", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
  ],
};

function Probe({
  initialProviderOverride,
}: {
  initialProviderOverride?: "codex" | "claude";
}) {
  const { routing, choose } = useRoomRouting({
    roomId: ROOM_ID,
    readiness: READY,
    initialProviderOverride,
  });
  return (
    <>
      <span data-testid="resolved">{routing?.provider ?? "none"}</span>
      <button type="button" onClick={() => choose("claude")}>
        Choose Claude
      </button>
    </>
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe("useRoomRouting", () => {
  it("starts on the saved default when the room has no override", () => {
    render(<Probe />);
    expect(screen.getByTestId("resolved")).toHaveTextContent("codex");
  });

  it("persists a choice so the room reopens on it", async () => {
    const user = userEvent.setup();
    render(<Probe />);

    await user.click(screen.getByRole("button", { name: "Choose Claude" }));

    expect(screen.getByTestId("resolved")).toHaveTextContent("claude");
    expect(readRoomRouting(ROOM_ID)).toEqual({ provider: "claude" });
  });

  it("hydrates a previously stored override", async () => {
    writeRoomRouting(ROOM_ID, { provider: "claude" });
    render(<Probe />);

    expect(await screen.findByText("claude")).toBeInTheDocument();
  });

  it("lets a restored draft's provider win over storage", async () => {
    // The user was mid-compose, went to connect an AI, and came back. That
    // intent is more recent than whatever the room was last set to.
    writeRoomRouting(ROOM_ID, { provider: "claude" });
    render(<Probe initialProviderOverride="codex" />);

    expect(await screen.findByText("codex")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/components/use-room-routing.test.tsx`
Expected: FAIL — cannot resolve `./use-room-routing`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/features/discovery/components/use-room-routing.ts`:

```ts
"use client";

import type { Provider } from "@meld/contracts";
import { useCallback, useEffect, useState } from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { readRoomRouting, writeRoomRouting } from "./room-routing-store";
import { resolveEffectiveRouting, type AgentRouting } from "./routing-model";

// Owns the room's sticky routing override: the choice survives a reload and a
// closed tab, and never rewrites the user's saved global preference.
//
// Hydration happens in an effect, not a lazy useState initializer: this
// component is server-rendered, and reading localStorage during render would
// produce markup the client then contradicts.
export function useRoomRouting({
  roomId,
  readiness,
  initialProviderOverride,
}: {
  roomId: string;
  readiness: AgentReadiness | undefined;
  // A provider carried back on a restored draft. More recent intent than
  // whatever the room was last set to, so it wins and is itself persisted.
  initialProviderOverride?: Provider;
}): {
  routing: AgentRouting | undefined;
  choose: (provider: Provider) => void;
} {
  const [override, setOverride] = useState<AgentRouting | undefined>(
    initialProviderOverride ? { provider: initialProviderOverride } : undefined,
  );

  useEffect(() => {
    if (initialProviderOverride) {
      writeRoomRouting(roomId, { provider: initialProviderOverride });
      setOverride({ provider: initialProviderOverride });
      return;
    }
    setOverride(readRoomRouting(roomId));
  }, [initialProviderOverride, roomId]);

  const choose = useCallback(
    (provider: Provider) => {
      const next: AgentRouting = { provider };
      setOverride(next);
      writeRoomRouting(roomId, next);
    },
    [roomId],
  );

  // Resolution re-checks the stored override against live readiness on every
  // render, so a provider signed out since it was chosen is never shown or sent.
  return { routing: resolveEffectiveRouting(readiness, override), choose };
}
```

In `composer.tsx`: add a required `roomId: string` prop, delete the `selectedProvider` `useState` and the `effectiveRouting` lines added in Task 6, and use the hook instead:

```tsx
  const { routing: effectiveRouting, choose } = useRoomRouting({
    roomId,
    readiness: agentReadiness,
    initialProviderOverride,
  });
  const effectiveProvider = effectiveRouting?.provider;
```

Pass `onChoose={choose}` to `AgentRoutingChip`. Every other reference to `selectedProvider` (the two `onConnectPersonalAI` payloads at the old lines `189` and `260`) becomes `effectiveProvider`.

In `conversation.tsx`, pass the room id the component already holds:

```tsx
              roomId={roomId}
```

In `composer-test-harness.tsx`, add `roomId` to the destructured props of `renderComposer` with a default, and forward it:

```tsx
  roomId = "20000000-0000-4000-8000-000000000002",
```

- [ ] **Step 4: Run the full discovery suite**

Run: `cd apps/web && pnpm exec vitest run src/features/discovery/`
Expected: PASS.

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS — `roomId` is required, so any un-updated call site fails here.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/discovery/components/use-room-routing.ts apps/web/src/features/discovery/components/use-room-routing.test.tsx apps/web/src/features/discovery/components/composer.tsx apps/web/src/features/discovery/components/conversation.tsx apps/web/src/features/discovery/components/composer-test-harness.tsx
git commit -m "feat(discovery): let a room's routing choice outlive the tab"
```

---

### Task 8: Update the browser acceptance

The existing e2e drives the old `Selector` by `combobox`/`option` roles, which no longer exist. It must drive the menu instead, and prove the override is genuinely sticky.

**Files:**
- Modify: `e2e/product-agent-room-reply.spec.ts:117-129`

**Interfaces:**
- Consumes: the DOM produced by Tasks 4 and 7.
- Produces: nothing.

- [ ] **Step 1: Update the existing override case to drive the chip**

Replace the block at `e2e/product-agent-room-reply.spec.ts:117-129` with:

```ts
    // The routing chip is present before any mention is typed -- the row does
    // not change shape as the draft does.
    await expect(page.getByTestId("agent-provider-picker")).toBeVisible();

    await page
      .getByRole("combobox", { name: "Message" })
      .fill("@Product Agent challenge this assumption");
    await expect(page.getByTestId("agent-provider-picker")).toBeVisible();

    // Choose Codex explicitly from the chip's menu.
    await page.getByRole("button", { name: /Answer with/ }).click();
    await page.getByRole("menuitemradio", { name: "Codex" }).click();

    await page.getByRole("button", { name: "Send" }).click();
```

- [ ] **Step 2: Add the stickiness case**

Add this test to the same file, after the override test:

```ts
  test("a room remembers the provider you routed it to", async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    await authenticateContext(ownerContext, OWNER);
    const page = await ownerContext.newPage();

    const roomUrl = await createRoom(page);

    await page.getByRole("button", { name: /Answer with/ }).click();
    await page.getByRole("menuitemradio", { name: "Claude" }).click();
    await expect(
      page.getByRole("button", { name: /Answer with: Claude/ }),
    ).toBeVisible();

    // A reload of the same room comes back on Claude: the override is sticky,
    // not per-message, and it outlives the page.
    await page.goto(roomUrl);
    await expect(
      page.getByRole("button", { name: /Answer with: Claude/ }),
    ).toBeVisible();

    await ownerContext.close();
  });
```

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm test:e2e -- product-agent-room-reply`
Expected: PASS. If the chip's accessible name differs from `Answer with: Claude`, read the rendered name from the failure output and align the selector with what Task 3 actually produces — do not weaken the assertion to a bare `Claude`, which would also match the menu item.

- [ ] **Step 4: Run the whole verification set**

Run from the repo root: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/product-agent-room-reply.spec.ts
git commit -m "test(e2e): prove the routing chip drives and remembers a provider"
```

---

## Verification Checklist

Before calling this done, confirm each with actual output — not by inspection:

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes (includes `check:astryx`, `check:test-colocation`, and the workspace vitest suites).
- [ ] `pnpm test:e2e` passes.
- [ ] `grep -rn "SegmentedControl\|Selector" apps/web/src/features/discovery/components/composer.tsx` returns nothing — all three stacking blocks are gone.
- [ ] The composer's height does not change when a mention is completed, with a connected AI and with none.

## Known Deviations From The Spec

The spec's Testing section claims `composer.submission.test.tsx` passes unchanged. That is wrong and Task 6 corrects it: two tests there (`"hides the provider picker when only one provider is ready"` and `"hides the provider picker when the draft has no Product Agent mention"`) assert exactly the hiding behaviour this design reverses, and the e2e drives the old `Selector` roles. Submission *semantics* are unchanged — the same `providerOverride` reaches the action — but the DOM assertions are not.
