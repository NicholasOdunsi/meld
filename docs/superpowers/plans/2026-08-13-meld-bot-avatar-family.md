# Meld Bot Avatar Family Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared pixel-art Meld bot family, animate the Porcelain + Ink bot during workspace setup, replace circular Room agent icons with transparent agent heads, and surface a pointer-responsive agent head when that agent is mentioned in the composer.

**Architecture:** A shared `MeldBot` inline-SVG component owns one `36x36` geometry, three role variants, full/head appearances, and a discrete pupil offset. `WorkspaceSetupMascot` applies animation to semantic limb groups, `AgentMarker` renders static heads inside its existing size footprint, and a focused `ComposerAgentPeek` owns pointer tracking and entrance motion. A standalone static SVG mirrors the base geometry for non-React use.

**Tech Stack:** React 19, inline SVG, Next.js 16, Astryx design tokens, Vitest, Testing Library, XML validation.

## Global Constraints

- Base Meld bot: porcelain shell `#F1F0ED` and ink details `#1E293B`.
- Product Agent: pink shell with porcelain details; use `var(--color-icon-pink)` and `var(--color-on-dark)` in React.
- Research Agent: teal shell with porcelain details; use `var(--color-icon-teal)` and `var(--color-on-dark)` in React.
- Use `viewBox="0 0 36 36"`, `shape-rendering="crispEdges"`, and a transparent background.
- Keep semantic groups for `antenna`, `head`, `torso`, `left-arm`, `right-arm`, `left-leg`, and `right-leg`.
- Room avatars use head appearance with no circle, pill, border, or background field and remain static.
- Composer peeks only for exactly one semantic agent mention and uses a discrete `-1`, `0`, or `1` horizontal pupil offset.
- Workspace setup preserves reduced-motion behavior and owns all runtime animation.
- Preserve existing logo assets and unrelated worktree edits.

---

### Task 1: Shared Meld Bot Geometry and Variants

**Files:**
- Create: `apps/web/src/ui/meld-bot.tsx`
- Create: `apps/web/src/ui/meld-bot.test.tsx`
- Create: `apps/web/public/meld-bot.svg`

**Interfaces:**
- Produces: `MeldBot({ variant, appearance, eyeOffset, ...svgProps })`, where `variant` is `"meld" | "product" | "research"`, `appearance` is `"full" | "head"`, `eyeOffset` is `-1 | 0 | 1`, and remaining props follow `SVGProps<SVGSVGElement>`.
- Produces: semantic SVG group classes and `data-part` values consumed by workspace animation CSS and tests.

- [ ] **Step 1: Write the failing component tests**

Test that all variants render an SVG with crisp edges and the expected palette. Assert full appearance uses `viewBox="0 0 36 36"` and all seven body groups, head appearance excludes torso and limbs, and `eyeOffset` translates the shell-color pupil group by one SVG unit.

- [ ] **Step 2: Run the component test to verify it fails**

Run:

```bash
pnpm --filter @meld/web exec vitest run src/ui/meld-bot.test.tsx
```

Expected: FAIL because `meld-bot.tsx` does not exist.

- [ ] **Step 3: Implement the shared component and static SVG**

Create one stepped full-body geometry with independent limbs and a reusable head subset. Split eye sockets from shell-color pupils, map variants to CSS custom properties backed by Astryx tokens, and keep the SVG decorative by default so parent components own accessible naming. Mirror the base Porcelain + Ink full-body geometry in `public/meld-bot.svg` with semantic group IDs.

- [ ] **Step 4: Validate the shared component and asset**

Run:

```bash
pnpm --filter @meld/web exec vitest run src/ui/meld-bot.test.tsx
xmllint --noout apps/web/public/meld-bot.svg
```

Expected: component tests pass and the standalone asset is valid XML.

---

### Task 2: Workspace Setup Animation Replacement

**Files:**
- Modify: `apps/web/src/features/workspaces/workspace-setup-mascot.tsx`
- Modify: `apps/web/src/features/workspaces/workspace-setup.test.tsx`

**Interfaces:**
- Consumes: `MeldBot` with `variant="meld"` and semantic part classes.
- Preserves: `WorkspaceSetupMascot({ prefersReducedMotion })`, stage test ID, setup duration, shadow, and reduced-motion data state.

- [ ] **Step 1: Update the failing setup assertions**

Replace the old PNG-source assertion with checks for the inline Meld bot, `data-variant="meld"`, all independently addressable limbs, and the existing `playful`/`reduced` motion states.

- [ ] **Step 2: Run the setup test to verify it fails**

Run:

```bash
pnpm --filter @meld/web exec vitest run src/features/workspaces/workspace-setup.test.tsx
```

Expected: FAIL because setup still renders `/mascots/meld-spark.png`.

- [ ] **Step 3: Replace the image and animation**

Render the inline Meld bot inside the existing Astryx `Center`. Animate the head/torso group, independent arms, independent legs, antenna, and shadow using motion and spacing tokens. Disable every animation for both `data-motion="reduced"` and the reduced-motion media query.

- [ ] **Step 4: Run focused setup verification**

Run:

```bash
pnpm --filter @meld/web exec vitest run src/features/workspaces/workspace-setup.test.tsx
```

Expected: all setup timing, bot, and reduced-motion tests pass.

---

### Task 3: Transparent Room Agent Heads

**Files:**
- Modify: `apps/web/src/features/rooms/components/agent-marker.tsx`
- Modify: `apps/web/src/features/rooms/components/conversation.test.tsx`
- Modify: `apps/web/src/features/rooms/components/composer.mentions.test.tsx`
- Modify: `apps/web/src/features/rooms/components/room-header.test.tsx`

**Interfaces:**
- Consumes: `MeldBot` with `variant={kind}` and `appearance="head"`.
- Preserves: `AgentMarker({ kind, name, size, isGrouped })`, accessible `role="img"`, accessible name, test IDs, marker dimensions, and grouped margin.

- [ ] **Step 1: Update avatar contract assertions**

Assert Product and Research markers contain matching head variants, exclude torso and limbs, expose no border radius/background/border, remain accessible by agent name, and appear correctly in message, mention, and room roster surfaces.

- [ ] **Step 2: Run focused Room tests to verify they fail**

Run:

```bash
pnpm --filter @meld/web exec vitest run src/features/rooms/components/conversation.test.tsx src/features/rooms/components/composer.mentions.test.tsx src/features/rooms/components/room-header.test.tsx
```

Expected: FAIL on the old circular marker style and missing bot variants.

- [ ] **Step 3: Replace circular icons with bots**

Remove `Icon`, pixel robot/search adapters, role background colors, circle radius, and border. Render the correct `MeldBot` head variant at `100%` width/height inside the existing Astryx `Center` footprint. Keep grouped spacing and `flexShrink` behavior.

- [ ] **Step 4: Run focused Room verification**

Run the same Vitest command from Step 2.

Expected: all conversation, mention, and room header tests pass.

---

### Task 4: Mentioned Agent Composer Peek

**Files:**
- Create: `apps/web/src/features/rooms/components/composer-agent-peek.tsx`
- Modify: `apps/web/src/features/rooms/components/composer.tsx`
- Modify: `apps/web/src/features/rooms/components/composer.mentions.test.tsx`

**Interfaces:**
- Consumes: `ComposerAgentPeek({ kind })`, where `kind` is `"product" | "research"`.
- Consumes: `draftAgentKind` already derived from semantic mention submission data.
- Produces: a decorative head with `data-testid="composer-agent-peek"` and pointer-responsive pupils.

- [ ] **Step 1: Add failing mention-presence tests**

Select each agent from the mention picker and assert the matching head appears. Remove the mention and assert it disappears. Send a valid mentioned draft and assert the head disappears when the controlled value clears. Assert multiple agent mentions show no peek.

- [ ] **Step 2: Add failing pointer tests**

Mock the head bounds, move the pointer left and right across the composer, and assert the pupil group receives `translate(-1 0)` and `translate(1 0)`. Move the pointer out and assert the transform returns to `translate(0 0)`.

- [ ] **Step 3: Implement the focused peek component**

Render an absolutely positioned Astryx `Center` containing `MeldBot` with `appearance="head"`. Own the `eyeOffset` state and calculate its discrete value from pointer coordinates relative to the head center. Add a two-step `--duration-fast-min` rise that translates the head by `--spacing-8`, disable only that animation under reduced motion, and keep the surface transparent without intercepting composer controls.

- [ ] **Step 4: Integrate with the composer**

Give the existing root `VStack` a positioning context and render `ComposerAgentPeek` only when `draftAgentKind` is defined. Keep all draft, readiness, attachment, and submission behavior unchanged.

- [ ] **Step 5: Run composer verification**

Run:

```bash
pnpm --filter @meld/web exec vitest run src/features/rooms/components/composer.mentions.test.tsx src/features/rooms/components/composer.test.tsx
```

Expected: mention selection, removal, pointer tracking, validation, readiness, attachments, and send behavior pass.

---

### Task 5: Repository and Visual Verification

**Files:**
- Verify: all files from Tasks 1-4

**Interfaces:**
- Consumes: completed bot family, setup animation, Room markers, and composer peek.
- Produces: evidence that the change follows Astryx conventions and renders at target sizes.

- [ ] **Step 1: Run static validation**

Run:

```bash
pnpm --filter @meld/web typecheck
pnpm exec eslint apps/web/src/ui/meld-bot.tsx apps/web/src/ui/meld-bot.test.tsx apps/web/src/features/workspaces/workspace-setup-mascot.tsx apps/web/src/features/workspaces/workspace-setup.test.tsx apps/web/src/features/rooms/components/agent-marker.tsx apps/web/src/features/rooms/components/composer-agent-peek.tsx apps/web/src/features/rooms/components/composer.tsx
node scripts/check-astryx-conventions.mjs apps/web/src/ui/meld-bot.tsx apps/web/src/features/workspaces/workspace-setup-mascot.tsx apps/web/src/features/rooms/components/agent-marker.tsx apps/web/src/features/rooms/components/composer-agent-peek.tsx apps/web/src/features/rooms/components/composer.tsx
git diff --check
```

Expected: all commands pass.

- [ ] **Step 2: Render and inspect assets**

Render `meld-bot.svg` to PNG and inspect it at full size and 28px. Start the existing web dev server on an available port, open workspace setup and a Room through the local E2E fixture, and capture desktop/mobile screenshots. Confirm setup motion is nonblank and framed, Room heads have no circles, role colors are distinguishable, composer peeks clear the input and avoid controls, and no UI overlaps occur.

- [ ] **Step 3: Review the scoped diff**

Run:

```bash
git diff --stat -- apps/web/public/meld-bot.svg apps/web/src/ui/meld-bot.tsx apps/web/src/ui/meld-bot.test.tsx apps/web/src/features/workspaces/workspace-setup-mascot.tsx apps/web/src/features/workspaces/workspace-setup.test.tsx apps/web/src/features/rooms/components/agent-marker.tsx apps/web/src/features/rooms/components/composer-agent-peek.tsx apps/web/src/features/rooms/components/composer.tsx apps/web/src/features/rooms/components/conversation.test.tsx apps/web/src/features/rooms/components/composer.mentions.test.tsx apps/web/src/features/rooms/components/room-header.test.tsx
```

Expected: only the approved bot family and its focused tests appear.
