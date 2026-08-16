# Pixel Room Starter Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three empty-room starter illustrations with crisp, two-tone pixel-art SVGs that remain readable at the existing 32px display size.

**Architecture:** Keep the existing `EmptyRoomStart` component and asset URLs unchanged. Replace the three files under `apps/web/public/room-starters/` with self-contained 16x16 SVGs using neutral outlines and action-specific accent strokes.

**Tech Stack:** Static SVG assets, Next.js public assets, Vitest, XML parsing via repository shell tooling.

## Global Constraints

- Preserve the existing asset filenames and `/room-starters/*.svg` URLs.
- Use a shared `viewBox="0 0 16 16"` and `shape-rendering="crispEdges"`.
- Use no gradients, filters, animation, raster images, or component/layout changes.
- Keep the existing 32px contain-fit icon box as the sizing contract.

---

### Task 1: Replace the starter SVG assets

**Files:**
- Modify: `apps/web/public/room-starters/plan-feature.svg`
- Modify: `apps/web/public/room-starters/map-user-flow.svg`
- Modify: `apps/web/public/room-starters/brainstorm.svg`

**Interfaces:**
- Consumes: the existing static URLs referenced by `EmptyRoomStart`.
- Produces: three valid SVG documents with the same filenames and action-specific pixel silhouettes.

- [ ] **Step 1: Write the three SVG documents**

Use a 16x16 viewBox and crisp edges. Use a neutral `#f1f0ed` outline with accent colors `#d58e6d`, `#d87587`, and `#78bca5` for Plan a Feature, Map a User Flow, and Brainstorm respectively. Draw a document, a branching flow, and a lightbulb using only paths/rectangles/polygons.

- [ ] **Step 2: Validate the asset structure**

Run:

```bash
for file in apps/web/public/room-starters/*.svg; do
  grep -q 'viewBox="0 0 16 16"' "$file"
  grep -q 'shape-rendering="crispEdges"' "$file"
  ! grep -q '<linearGradient\|<radialGradient\|<image\|filter=' "$file"
done
```

Expected: the command exits successfully for all three files.

- [ ] **Step 3: Run the focused component test**

Run:

```bash
pnpm --filter @meld/web exec vitest run src/features/rooms/components/empty-room-start.test.tsx
```

Expected: all empty-room starter interaction tests pass without changes to component behavior.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check
git diff --stat -- apps/web/public/room-starters
```

Expected: no whitespace errors and only the three starter SVG assets are listed for the implementation change.
