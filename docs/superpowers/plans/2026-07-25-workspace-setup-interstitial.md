# Workspace Setup Interstitial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a six-second branded onboarding interstitial with three rotating Meld capability tips before opening Discovery Rooms.

**Architecture:** The authenticated server page verifies organization membership before rendering a focused client component. The client component owns tip timing, reduced-motion presentation, destination prefetching, and one-way replacement navigation; the existing invite screen sends both completion actions to this route.

**Tech Stack:** Next.js App Router, React, TypeScript, Astryx Design System, Vitest, Testing Library, Playwright

## Global Constraints

- Use Astryx components for layout; do not add raw layout elements or a page stylesheet.
- Show only the Meld mark, `Setting up your workspace.`, and one rotating tip; do not add a spinner or progress bar.
- Render the rotating tip with Astryx `Text` using `type="body"` and `color="secondary"`.
- Show each of the three approved tips for two seconds, for six seconds total.
- Use design-system motion tokens and remove the fade under `prefers-reduced-motion`.
- Replace the setup route with `/<organization-id>/discovery` so Back cannot return to the interstitial.
- Preserve the untracked `docs/product-feature-checklist.md`.

---

### Task 1: Protected setup route and timed client screen

**Files:**
- Create: `apps/web/src/app/(app)/onboarding/[organizationId]/setup/page.tsx`
- Create: `apps/web/src/features/workspaces/workspace-setup.tsx`
- Modify: `apps/web/src/features/workspaces/organization-people.ts`
- Test: `apps/web/src/features/workspaces/workspace-setup.test.tsx`

**Interfaces:**
- Consumes: `createClient(headers)` and `isWorkspaceFakeEnabled()` from the existing workspace data layer.
- Produces: `requireOrganizationMembership(organizationId: string, returnPath: string): Promise<void>` and `WorkspaceSetup({ organizationId }: { organizationId: string }): JSX.Element`.

- [ ] **Step 1: Write the failing timer and navigation tests**

```tsx
render(<WorkspaceSetup organizationId={ORGANIZATION_ID} />);
expect(screen.getByText(/Invite your team into Discovery Rooms/)).toBeVisible();
act(() => vi.advanceTimersByTime(2000));
expect(screen.getByText(/Mention the Product Agent/)).toBeVisible();
act(() => vi.advanceTimersByTime(2000));
expect(screen.getByText(/Connect your own Codex or Claude subscription/)).toBeVisible();
act(() => vi.advanceTimersByTime(2000));
expect(replace).toHaveBeenCalledWith(`/${ORGANIZATION_ID}/discovery`);
```

- [ ] **Step 2: Run the focused test and verify the missing component fails**

Run: `pnpm --filter @meld/web test -- src/features/workspaces/workspace-setup.test.tsx`

Expected: FAIL because `WorkspaceSetup` does not exist.

- [ ] **Step 3: Add the membership guard and setup page**

```tsx
export default async function WorkspaceSetupPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  await requireOrganizationMembership(
    organizationId,
    `/onboarding/${organizationId}/setup`,
  );
  return <WorkspaceSetup organizationId={organizationId} />;
}
```

- [ ] **Step 4: Implement the Astryx setup screen and timers**

```tsx
const SETUP_TIPS = [
  "Invite your team into Discovery Rooms to share research, evidence, and decisions.",
  "Mention the Product Agent to ask questions, challenge assumptions, and get direction.",
  "Connect your own Codex or Claude subscription — AI runs on your account, never ours.",
];
const TIP_DURATION_MS = 2000;
const SETUP_DURATION_MS = TIP_DURATION_MS * SETUP_TIPS.length;
```

Render the Meld mark, the approved heading, and `SETUP_TIPS[tip.index]` inside the content-only wash `AppShell`. Prefetch the discovery destination on mount, advance tips without moving beyond the final item, and call `router.replace(destination)` after `SETUP_DURATION_MS`.

```tsx
<Text type="body" color="secondary">
  {SETUP_TIPS[tip.index]}
</Text>
```

- [ ] **Step 5: Run the focused tests**

Run: `pnpm --filter @meld/web test -- src/features/workspaces/workspace-setup.test.tsx`

Expected: PASS for tip rotation, prefetching, final-tip hold, and replacement navigation.

### Task 2: Connect onboarding and verify the complete flow

**Files:**
- Modify: `apps/web/src/features/workspaces/invite-onboarding.tsx`
- Modify: `e2e/onboarding.spec.ts`

**Interfaces:**
- Consumes: `/onboarding/<organization-id>/setup` from Task 1.
- Produces: Identical Done and Skip navigation into the setup interstitial.

- [ ] **Step 1: Update both invite-step actions**

```tsx
const enterWorkspace = () =>
  router.push(`/onboarding/${organizationId}/setup`);
```

Use `enterWorkspace` as the `onClick` handler for both `Done` and `Skip for now`.

- [ ] **Step 2: Add the interstitial to the onboarding browser test**

```ts
await expect(
  adminPage.getByRole("heading", {
    name: "Setting up your workspace.",
    exact: true,
  }),
).toBeVisible();
await expect(
  adminPage.getByText(/Invite your team into Discovery Rooms/),
).toBeVisible();
```

Keep the Discovery Rooms assertion and give it enough time for the intentional six-second delay.

- [ ] **Step 3: Run project verification**

Run:

```bash
pnpm --filter @meld/web test
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm exec astryx check apps/web/src
pnpm --filter @meld/web build
pnpm exec playwright test e2e/onboarding.spec.ts
```

Expected: all commands pass.

- [ ] **Step 4: Review and commit the focused feature**

Run:

```bash
git diff --check
git status --short
git add apps/web/src/app/\(app\)/onboarding/\[organizationId\]/setup/page.tsx apps/web/src/features/workspaces/workspace-setup.tsx apps/web/src/features/workspaces/workspace-setup.test.tsx apps/web/src/features/workspaces/organization-people.ts apps/web/src/features/workspaces/invite-onboarding.tsx e2e/onboarding.spec.ts docs/superpowers/plans/2026-07-25-workspace-setup-interstitial.md
git commit -m "feat: add workspace setup interstitial"
```

Expected: the feature files are committed and `docs/product-feature-checklist.md` remains untracked.
