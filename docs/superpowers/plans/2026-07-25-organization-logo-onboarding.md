# Organization Logo Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first-product onboarding field with a required organization-logo upload while silently creating an `Untitled product`.

**Architecture:** Extend the organization record and creation RPC with a logo storage path, add a purpose-built Supabase Storage bucket, and validate/upload the logo in the existing server action before the transactional organization/product creation. Keep the page’s current Astryx layout and use its `FileInput` component.

**Tech Stack:** Next.js server actions, React 19, Astryx Design System, Zod, Supabase Postgres and Storage, Vitest, Playwright.

## Global Constraints

- Keep the frameless sign-in-style layout at a 432px content width.
- Use Astryx components and tokens; no raw layout elements or styling values.
- Accept one required PNG, JPEG, or WebP logo no larger than 2 MB.
- Create the hidden initial product with the exact name `Untitled product`.
- Existing organizations must remain valid without a logo.

---

### Task 1: Persist organization logos

**Files:**
- Create: `supabase/migrations/202607250001_organization_logos.sql`
- Modify: `supabase/tests/invitations.test.sql`

**Interfaces:**
- Produces: `public.organizations.logo_path text`
- Produces: public Storage bucket `organization-logos`
- Produces: `public.create_organization_with_product(organization_name text, product_name text, organization_logo_path text default null)`

- [ ] **Step 1: Add a failing SQL assertion**

Call the creation function with a logo path and assert the new organization stores `10000000-0000-4000-8000-000000000001/logo.webp`.

- [ ] **Step 2: Run the SQL test**

Run: `pnpm test:sql`
Expected: FAIL because `logo_path` and the three-argument function do not exist.

- [ ] **Step 3: Add the migration**

Add nullable `logo_path`, replace the two-argument RPC with the compatible three-argument version, and store the path in the organization insert. Create the public bucket with:

```sql
file_size_limit = 2097152
allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
```

Add authenticated insert/select/update/delete policies that constrain writes to the uploader’s UUID folder.

- [ ] **Step 4: Verify SQL**

Run: `pnpm test:sql`
Expected: PASS.

### Task 2: Validate and upload the logo

**Files:**
- Modify: `apps/web/src/features/workspaces/schemas.ts`
- Modify: `apps/web/src/features/workspaces/actions.ts`
- Modify: `apps/web/src/features/workspaces/actions.test.ts`
- Modify: `apps/web/src/features/workspaces/e2e-fake.ts`

**Interfaces:**
- Consumes: Storage bucket `organization-logos`
- Produces: `OrganizationInput.logoPath?: string`
- Produces: `WorkspaceFormState.fieldErrors.logo?: string`

- [ ] **Step 1: Add failing action tests**

Cover missing files, unsupported MIME types, files over 2 MB, upload failure, and success. The success assertion must verify:

```ts
expect(mocks.rpc).toHaveBeenCalledWith(
  "create_organization_with_product",
  {
    organization_name: "Northstar",
    product_name: "Untitled product",
    organization_logo_path: expect.stringMatching(
      /^10000000-0000-4000-8000-000000000001\//,
    ),
  },
);
```

- [ ] **Step 2: Run the focused tests**

Run: `pnpm --filter @meld/web test -- src/features/workspaces/actions.test.ts`
Expected: FAIL on the new logo expectations.

- [ ] **Step 3: Implement validation and upload**

Validate `FormData.get("logo")` as a non-empty `File`, accept exactly `image/png`, `image/jpeg`, and `image/webp`, and cap `size` at `2 * 1024 * 1024`. Upload with `upsert: false`, then call organization creation with:

```ts
{
  name,
  productName: "Untitled product",
  logoPath,
}
```

On RPC failure, attempt to remove the uploaded object. In the E2E fake path, accept the validated file but skip real Storage.

- [ ] **Step 4: Verify action behavior**

Run: `pnpm --filter @meld/web test -- src/features/workspaces/actions.test.ts`
Expected: PASS.

### Task 3: Replace the product field with logo upload

**Files:**
- Modify: `apps/web/src/app/(app)/onboarding/page.tsx`
- Modify: `apps/web/src/features/workspaces/onboarding-form.test.tsx`
- Modify: `e2e/onboarding.spec.ts`
- Create: `e2e/fixtures/organization-logo.png`

**Interfaces:**
- Consumes: `createOrganizationFromForm` with `name` and `logo`
- Produces: an onboarding form with accessible `Organization name` and `Organization logo` controls

- [ ] **Step 1: Add failing UI tests**

Assert the logo control exists, `First product` does not exist, and `Create workspace` remains a large Astryx button.

- [ ] **Step 2: Run the component test**

Run: `pnpm --filter @meld/web test -- src/features/workspaces/onboarding-form.test.tsx`
Expected: FAIL because the product field is still rendered.

- [ ] **Step 3: Implement the form**

Use controlled `FileInput` state with `mode="dropzone"`, the accepted MIME types, `maxSize={2 * 1024 * 1024}`, and server-returned field status. Before dispatching the form action, append the controlled file as `logo`. Update the supporting copy to `Add your organization name and logo`.

- [ ] **Step 4: Update end-to-end coverage**

Attach `e2e/fixtures/organization-logo.png`, remove the first-product interaction, create the organization, and keep the existing members-page redirect assertion.

- [ ] **Step 5: Run all verification**

Run:

```bash
pnpm check:astryx
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @meld/web build
```

Expected: every command passes.
