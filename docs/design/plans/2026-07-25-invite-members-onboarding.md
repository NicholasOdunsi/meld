# Invite Members Onboarding Implementation Plan

**Goal:** Add a dedicated invite-members step between organization creation and Discovery Rooms.

**Architecture:** Extract the existing organization-people query into a shared server loader, then use it in both member settings and the new frameless onboarding route. Reuse the existing invitation server action through an onboarding presentation of `InviteMemberForm`, and render compact Astryx lists for active and invited people.

**Tech Stack:** Next.js App Router and server actions, React 19, Astryx Design System, Supabase, Vitest, Playwright.

## Global Constraints

- Organization creation redirects to `/onboarding/<organization-id>/members`.
- Sending an invitation stays on the onboarding route and refreshes the invited list.
- `Skip for now` navigates to `/<organization-id>/discovery`.
- Preserve the existing members settings page and invitation delivery behavior.
- Use `AppShell`, Astryx layout primitives, `List`, `ListItem`, `Avatar`, `Badge`, `TextInput`, and `Button`.
- Match the frameless sign-in and organization-creation typography and placement.

---

### Task 1: Share organization people loading

**Files:**
- Create: `apps/web/src/features/workspaces/organization-people.ts`
- Modify: `apps/web/src/app/(app)/[organizationId]/settings/members/page.tsx`

**Interfaces:**
- Produces: `loadOrganizationPeople(organizationId: string, returnPath: string): Promise<{ isAdmin: boolean; members: MembershipRecord[]; invitations: InvitationRecord[] }>`
- Preserves: fake-workspace support, authentication redirect, membership not-found behavior, admin-only invitation loading, and safe loading errors.

- [ ] **Step 1: Extract the loader and record types**

Move the real and fake data-loading branches out of the settings page into the server-only module. Keep presentation mapping in the settings page.

- [ ] **Step 2: Replace inline settings queries**

Call:

```ts
const { isAdmin, members, invitations } =
  await loadOrganizationPeople(
    organizationId,
    `/${organizationId}/settings/members`,
  );
```

- [ ] **Step 3: Verify existing workspace tests**

Run: `pnpm --filter @meld/web test`
Expected: all existing tests pass.

### Task 2: Build the onboarding invite surface

**Files:**
- Create: `apps/web/src/app/(app)/onboarding/[organizationId]/members/page.tsx`
- Create: `apps/web/src/features/workspaces/invite-onboarding.tsx`
- Create: `apps/web/src/features/workspaces/invite-onboarding.test.tsx`
- Modify: `apps/web/src/features/workspaces/invite-member-form.tsx`

**Interfaces:**
- Consumes: `loadOrganizationPeople`, `InviteMemberForm`, active members, and active invitations.
- Produces: `InviteOnboarding({ organizationId, members, invitations })`.
- Adds: `InviteMemberForm` prop `presentation?: "settings" | "onboarding"`.

- [ ] **Step 1: Add a failing component test**

Render `InviteOnboarding` and assert:

```ts
screen.getByRole("heading", { name: "Invite your team." });
screen.getByText("People with access");
screen.getByText("Invited people");
screen.getByRole("button", { name: "Send invitation" });
screen.getByRole("button", { name: "Skip for now" });
```

Also assert active and invited email addresses render.

- [ ] **Step 2: Implement the onboarding presentation**

Use the existing wash `AppShell`, Meld mark, centered `display-3` heading, large secondary supporting text, and a token-constrained wider column. Render active and invited rows with:

```tsx
<ListItem
  label={email}
  startContent={<Avatar name={email} size="md" />}
  endContent={<Badge>{status}</Badge>}
/>
```

Use a secondary large `Skip for now` button that pushes to the organization Discovery route.

- [ ] **Step 3: Adapt the invite form**

For `presentation="onboarding"`, omit the Card and internal heading, use large controls, clear the email after a successful invite, and keep `router.refresh()` so the invited list updates without navigation.

- [ ] **Step 4: Add the server route**

Load organization people with the onboarding URL as the sign-in return path, call `notFound()` when `isAdmin` is false, filter invitation rows to active invitations, and render `InviteOnboarding`.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter @meld/web test -- src/features/workspaces/invite-onboarding.test.tsx`
Expected: PASS.

### Task 3: Connect and verify the onboarding flow

**Files:**
- Modify: `apps/web/src/features/workspaces/actions.ts`
- Modify: `apps/web/src/features/workspaces/actions.test.ts`
- Modify: `e2e/onboarding.spec.ts`

**Interfaces:**
- Changes successful organization creation redirect to `/onboarding/<organization-id>/members`.
- Keeps invitation submission on the onboarding route.

- [ ] **Step 1: Update action expectations**

Assert organization creation redirects with:

```ts
redirect(
  "/onboarding/30000000-0000-4000-8000-000000000003/members",
  "replace",
);
```

- [ ] **Step 2: Update the action**

Change both fake and real organization-creation redirect branches to the new onboarding URL.

- [ ] **Step 3: Update end-to-end onboarding**

Verify the invite heading after organization creation, send the first invitation, confirm its email remains visible on the same route, click `Skip for now`, and assert the `Discovery Rooms` heading.

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm check:astryx
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @meld/web build
```

Expected: every command passes.
