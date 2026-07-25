# Local Auth and Onboarding Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local magic-link sign-in and workspace onboarding reliable at `http://127.0.0.1:3000`, without duplicate sign-in emails or a stalled success screen.

**Architecture:** Keep `127.0.0.1:3000` as the canonical local origin and explicitly trust it in Next development mode. Treat a successful magic-link request as a terminal form state, and move successful onboarding navigation into the Server Action so it does not depend on a hydrated client effect.

**Tech Stack:** Next.js 16 Server Actions, React 19, Supabase Auth, Astryx components, Vitest, Testing Library, Playwright.

## Global Constraints

- `http://127.0.0.1:3000` is the canonical local application origin.
- Successful magic-link submission disables the email input and submit button; failed submissions remain retryable.
- Successful workspace creation replaces the onboarding route with `/<organization-id>/settings/members`.
- A missing organization ID must produce an error state, never a non-navigating success state.
- Do not change database schemas, Google OAuth, production domains, or invitation delivery.
- UI changes must use Astryx component props and existing design tokens; no custom CSS or raw layout elements.
- Do not touch or stage `docs/product-feature-checklist.md`.

---

### Task 1: Trust the local origin and make magic-link submission one-shot

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/src/features/auth/actions.ts`
- Modify: `apps/web/src/app/(auth)/sign-in/page.tsx`
- Create: `apps/web/next.config.test.ts`
- Create: `apps/web/src/app/(auth)/sign-in/page.test.tsx`

**Interfaces:**
- Consumes: exported `AuthActionState` returned by `requestMagicLink`.
- Produces: `MagicLinkForm` with props `{ state, action, nextPath }`, plus Next configuration containing `allowedDevOrigins: ["127.0.0.1"]`.

- [ ] **Step 1: Write the failing Next configuration test**

```ts
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next local development configuration", () => {
  it("allows the canonical 127.0.0.1 development origin", () => {
    expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
  });
});
```

- [ ] **Step 2: Extract and test the magic-link form success state**

Export `MagicLinkForm` from the sign-in page with this interface:

```ts
export function MagicLinkForm({
  state,
  action,
  nextPath,
}: {
  state: AuthActionState;
  action: (payload: FormData) => void;
  nextPath: string;
}) {}
```

Export the existing `AuthActionState` type from
`apps/web/src/features/auth/actions.ts`; do not change the action behavior.

In `page.test.tsx`, render the exported form with:

```ts
render(
  <MagicLinkForm
    state={{
      status: "success",
      message: "Check your email for a secure sign-in link.",
    }}
    action={vi.fn()}
    nextPath="/onboarding"
  />,
);

expect(
  screen.getByRole("textbox", { name: /email address/i }),
).toBeDisabled();
expect(
  screen.getByRole("button", { name: "Sign-in link sent" }),
).toBeDisabled();
```

Mock `useFormStatus` to return `{ pending: false }` and provide the existing
`matchMedia` test stub required by Astryx.

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```bash
pnpm --filter web exec vitest run next.config.test.ts "src/app/(auth)/sign-in/page.test.tsx"
```

Expected: the configuration assertion fails because `allowedDevOrigins` is
absent, and the component import/assertions fail because `MagicLinkForm` and
the disabled success state do not exist.

- [ ] **Step 4: Implement the minimal trusted-origin configuration**

Add this top-level field without changing the existing upload configuration:

```ts
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
};
```

- [ ] **Step 5: Implement the one-shot magic-link form**

Move the email state and magic-link form markup into the exported
`MagicLinkForm`. Define:

```ts
const linkSent = state.status === "success";
```

Pass the state through Astryx props:

```tsx
<TextInput
  type="email"
  label="Email address"
  value={email}
  onChange={setEmail}
  htmlName="email"
  placeholder="you@example.com"
  isRequired
  isDisabled={linkSent}
  disabledMessage="A sign-in link has already been sent."
  status={
    state.fieldErrors?.email
      ? { type: "error", message: state.fieldErrors.email }
      : undefined
  }
/>
```

Render the submit button with:

```tsx
<SubmitButton
  label={linkSent ? "Sign-in link sent" : "Email me a sign-in link"}
  nextPath={nextPath}
  variant="primary"
  isDisabled={linkSent}
/>
```

Extend `SubmitButton` with `isDisabled?: boolean` and pass it to Astryx
`Button`. Keep the Google form separate and unchanged.

- [ ] **Step 6: Run Task 1 tests and quality checks**

Run:

```bash
pnpm --filter web exec vitest run next.config.test.ts "src/app/(auth)/sign-in/page.test.tsx"
pnpm --filter web typecheck
pnpm --filter web lint
pnpm check:astryx
```

Expected: all commands pass.

- [ ] **Step 7: Commit Task 1**

```bash
git add apps/web/next.config.ts apps/web/next.config.test.ts \
  apps/web/src/features/auth/actions.ts \
  "apps/web/src/app/(auth)/sign-in/page.tsx" \
  "apps/web/src/app/(auth)/sign-in/page.test.tsx"
git commit -m "fix: stabilize local magic-link sign-in"
```

### Task 2: Redirect successful onboarding from the Server Action

**Files:**
- Modify: `apps/web/src/features/workspaces/actions.ts`
- Modify: `apps/web/src/features/workspaces/actions.test.ts`
- Modify: `apps/web/src/app/(app)/onboarding/page.tsx`
- Modify: `apps/web/src/features/workspaces/onboarding-form.test.tsx`

**Interfaces:**
- Consumes: `createOrganization(parsed.data)` returning `{ organizationId, organizationName, productId, productName }`.
- Produces: `createOrganizationFromForm(previousState, formData)` returning `WorkspaceFormState` only for validation/database errors and calling `redirect(path, "replace")` on success.

- [ ] **Step 1: Write failing Server Action redirect tests**

Mock `next/navigation` in `actions.test.ts` with a hoist-safe mock:

```ts
const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string, type: string) => {
    throw new Error(`redirect:${type}:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: navigationMocks.redirect,
}));
```

Import `createOrganizationFromForm`. Add a success test whose RPC returns the
existing complete organization record, then assert:

```ts
await expect(
  createOrganizationFromForm(
    { status: "idle" },
    workspaceFormData("Northstar", "Mobile app"),
  ),
).rejects.toThrow(
  "redirect:replace:/30000000-0000-4000-8000-000000000003/settings/members",
);
expect(navigationMocks.redirect).toHaveBeenCalledWith(
  "/30000000-0000-4000-8000-000000000003/settings/members",
  "replace",
);
```

Add a malformed-result test whose RPC data omits `organization_id` and assert
the returned state equals:

```ts
{
  status: "error",
  message: "We could not create the organization. Please try again.",
  retryable: true,
}
```

and `navigationMocks.redirect` was not called.

- [ ] **Step 2: Run the focused action tests and confirm RED**

Run:

```bash
pnpm --filter web exec vitest run src/features/workspaces/actions.test.ts
```

Expected: the success case returns a success state instead of redirecting, and
the malformed result incorrectly returns success.

- [ ] **Step 3: Implement redirect outside the error-catching boundary**

Import `redirect` from `next/navigation`. Restructure
`createOrganizationFromForm` so only organization creation is inside the
`try/catch`:

```ts
let organization: Awaited<ReturnType<typeof createOrganization>>;

try {
  organization = await createOrganization(parsed.data);
} catch {
  return {
    status: "error",
    message: "We could not create the organization. Please try again.",
    retryable: true,
  };
}

if (!organization.organizationId) {
  return {
    status: "error",
    message: "We could not create the organization. Please try again.",
    retryable: true,
  };
}

redirect(
  `/${organization.organizationId}/settings/members`,
  "replace",
);
```

The redirect must remain outside `catch` because Next implements redirects as
control-flow exceptions.

- [ ] **Step 4: Remove obsolete client navigation**

In `apps/web/src/app/(app)/onboarding/page.tsx`, remove `useRouter`,
`useEffect`, and the success-state navigation effect. Keep `useActionState`
and field state unchanged.

Update `onboarding-form.test.tsx` to remove its `next/navigation` router mock;
the rendered form no longer consumes the router.

- [ ] **Step 5: Run Task 2 focused tests**

Run:

```bash
pnpm --filter web exec vitest run \
  src/features/workspaces/actions.test.ts \
  src/features/workspaces/onboarding-form.test.tsx
```

Expected: all tests pass.

- [ ] **Step 6: Run the complete regression suite**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm check:astryx
pnpm exec playwright test
git diff --check
```

Expected: all commands and both browser workflows pass.

- [ ] **Step 7: Verify the real local flow**

Restart the web development server, open:

```text
http://127.0.0.1:3000/sign-in?next=/onboarding
```

Request one magic link and verify the form becomes disabled. Open the newest
Mailpit link once, create a new workspace, and verify the browser lands on:

```text
http://127.0.0.1:3000/<organization-id>/settings/members
```

Confirm the new owner row is Active and Admin and that the server prints no
blocked cross-origin development-resource warning.

- [ ] **Step 8: Commit Task 2**

```bash
git add apps/web/src/features/workspaces/actions.ts \
  apps/web/src/features/workspaces/actions.test.ts \
  "apps/web/src/app/(app)/onboarding/page.tsx" \
  apps/web/src/features/workspaces/onboarding-form.test.tsx
git commit -m "fix: redirect completed onboarding to members"
```
