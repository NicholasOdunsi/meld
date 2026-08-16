# Manual User-Flow Canvas Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the User Flows tab immediately usable for manual drawing without requiring a PRD, conversation context, or AI generation.

**Architecture:** Keep the existing shared tldraw store and generation pipeline. Give the real editor a dedicated positioned flex region, keep tldraw's default UI enabled, and treat generation as a compact secondary command above the canvas. Extend the non-production E2E fake boundary only enough to mint a signed canvas session for the existing fake user, then prove the real toolbar and manual record creation in Playwright.

**Tech Stack:** React 19, Next.js 16, Astryx 0.1.8, tldraw 5.3.0, Vitest 4, Playwright, existing canvas gateway.

## Global Constraints

- Manual drawing must work with no PRD and no clarification.
- Keep tldraw packages pinned exactly to `5.3.0`.
- Keep default tldraw drawing, selection, text, arrow, undo, redo, pan, and zoom UI visible for editors.
- Generation remains optional and must not clear, replace, or move manual records.
- Viewer sessions remain server-enforced read-only and do not show generation controls.
- Use Astryx layout components and token-backed styling; no raw layout `div` elements.

---

### Task 1: Stable Manual Canvas Region

**Files:**
- Modify: `apps/web/src/features/canvas/user-flow-trial-canvas.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-canvas.test.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-generation-controls.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-generation-controls.test.tsx`

**Interfaces:**
- Produces: `data-testid="user-flow-editor-host"`, a positioned `StackItem size="fill"` that gives `<Tldraw>` stable width and height.
- Produces: a secondary `Generate User Flow` command while leaving tldraw's default UI enabled.

- [x] Add failing assertions for a fill-sized positioned host, an explicit visible-UI contract, and secondary generation styling.
- [x] Run the focused Vitest files and confirm failure.
- [x] Wrap `<Tldraw>` in the dedicated host and pass `hideUi={false}`.
- [x] Make generation secondary and keep status/control content in a compact command band.
- [x] Run focused canvas tests, typecheck, lint, and Astryx checks.

---

### Task 2: Real Browser Manual-Drawing Gate

**Files:**
- Modify: `apps/web/src/app/api/canvas-session/route.ts`
- Modify: `apps/web/src/app/api/canvas-session/route.test.ts`
- Modify: `playwright.canvas-trial.config.ts`
- Modify: `e2e/user-flow-trial.spec.ts`

**Interfaces:**
- Consumes: the existing non-production workspace fake cookies and fake discovery room.
- Produces: a development/test-only canvas session path that still mints the normal signed ticket.

- [x] Add route coverage proving fake auth is accepted only when the existing fake workspace gate is enabled outside production.
- [x] Start the real Next app beside the canvas trial gateway in the Playwright configuration.
- [x] Assert the real tldraw toolbar is visible in an empty room.
- [x] Create a rectangle and an arrow through the real editor, then assert both records exist.
- [x] Assert generation remains optional and the editor is not read-only.
- [x] Run the canvas Playwright gate and capture a failure trace or screenshot when controls disappear.

---

### Task 3: Verification

**Files:**
- Modify: `docs/design/reports/2026-08-10-tldraw-trial-spike.md`

**Interfaces:**
- Records: exact focused tests, browser result, build result, and any explicit skips.

- [x] Run web tests, typecheck, lint, production build, and `pnpm check:astryx` with Node 22.23.2.
- [x] Run `pnpm test:e2e:canvas-trial` with the real Next app gate enabled by the config.
- [x] Update the report with manual-toolbar and manual-record evidence.
- [x] Run `git diff --check` and commit the correction.
