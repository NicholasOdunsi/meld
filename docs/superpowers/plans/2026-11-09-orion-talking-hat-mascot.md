# Orion Talking Hat Mascot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a reusable inline SVG talking hat for Orion and a local visual preview.

**Architecture:** Keep the artwork and expression mapping in one React SVG component. A separate development route displays illustration and avatar sizes without changing product screens.

**Tech Stack:** React 19, TypeScript, SVG, Next.js 16, Astryx 0.1.8, Vitest.

## Global Constraints

- The hat is an original interpretation of the supplied image, with folds forming its face.
- Use a transparent background, warm browns, restrained cyan, and a simpler avatar rendering.
- Respect `prefers-reduced-motion`; label meaningful SVGs accessibly.
- Follow `AGENTS.md`: discover Astryx components, use component layout, and use tokens for preview styling.
- Preserve unrelated uncommitted work and leave existing product screens unchanged.

---

### Task 1: Reusable mascot

**Files:**
- Create: `apps/web/src/ui/orion-talking-hat.tsx`
- Test: `apps/web/src/ui/orion-talking-hat.test.tsx`

**Interfaces:**
- Consumes: React `SVGProps<SVGSVGElement>`.
- Produces: `OrionTalkingHat`, `OrionTalkingHatProps`, and `OrionTalkingHatExpression = "neutral" | "curious" | "speaking"`.

- [x] **Step 1: Write focused rendering tests.** Check all expressions, unique gradient IDs across instances, default image role and label, decorative mode, and reduced-motion CSS.
- [x] **Step 2: Run the focused test and see it fail.** Run `pnpm --filter @meld/web test -- src/ui/orion-talking-hat.test.tsx`.
- [x] **Step 3: Implement the SVG.** Use a shared bent crown and uneven brim; render fold-based eye and mouth paths by expression. Use `useId()` to scope gradients, an `appearance` prop for the small avatar treatment, and a speaking mouth animation with a reduced-motion media rule.
- [x] **Step 4: Re-run focused tests.** Run `pnpm --filter @meld/web test -- src/ui/orion-talking-hat.test.tsx`.

### Task 2: Local visual preview and checks

**Files:**
- Create: `apps/web/src/app/dev/orion-mascot/page.tsx`

**Interfaces:**
- Consumes: `OrionTalkingHat` with `expression`, `appearance`, and standard SVG sizing props.
- Produces: `/dev/orion-mascot`, a local preview showing three expressions and an avatar-scale sample.

- [x] **Step 1: Create a preview using `AppShell`, `VStack`, `HStack`, `Card`, `Heading`, and `Text`.** Render neutral, curious, speaking, and avatar examples against light and dark token surfaces.
- [x] **Step 2: Run typecheck and lint for changed files.** Run `pnpm --filter @meld/web typecheck` and `pnpm --filter @meld/web exec eslint src/ui/orion-talking-hat.tsx src/ui/orion-talking-hat.test.tsx src/app/dev/orion-mascot/page.tsx`.
- [x] **Step 3: Inspect the rendered preview.** View illustration and avatar sizes in a browser or exported screenshot, then fix any weak silhouette or facial legibility.
- [x] **Step 4: Review the diff and commit only the mascot work.** Stage the two implementation files, the focused test, and this plan.
