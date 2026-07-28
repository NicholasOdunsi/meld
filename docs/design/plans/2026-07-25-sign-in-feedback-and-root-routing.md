# Sign-In Feedback and Root Routing Implementation Plan

**Goal:** Render only the newest sign-in feedback banner and route successful default magic-link callbacks away from the blank root page.

**Architecture:** Keep the existing email and Google Server Actions, but record the most recently submitted method in the sign-in client page and resolve all feedback through one banner slot. Turn the root page into an async server-side router that uses the authenticated user and their first organization membership to choose sign-in, onboarding, or Discovery.

**Tech Stack:** Next.js 16 App Router, React 19 `useActionState`, Supabase SSR, Astryx `Banner`, Vitest, Testing Library.

## Global Constraints

- Only one sign-in feedback banner may render at a time.
- The most recently submitted sign-in method supersedes callback and earlier method feedback.
- Signed-out root requests redirect to `/sign-in`.
- Signed-in users without an organization membership redirect to `/onboarding`.
- Signed-in organization members redirect to `/<organization-id>/discovery`.
- Do not change callback URL validation, provider configuration, or database schemas.
- UI must use existing Astryx components and tokens.
- Do not touch or stage `docs/product-feature-checklist.md`.

---

### Task 1: Make sign-in feedback mutually exclusive and newest-first

**Files:**
- Modify: `apps/web/src/app/(auth)/sign-in/page.tsx`
- Modify: `apps/web/src/app/(auth)/sign-in/page.test.tsx`

**Interfaces:**
- Consumes: `AuthActionState` from `@/features/auth/actions`.
- Produces: one `Banner` chosen from `"callback"`, `"magicLink"`, or `"google"` feedback sources.

- [ ] **Step 1: Write the failing interaction test**

Hoist controllable action mocks:

```ts
const actionMocks = vi.hoisted(() => ({
  requestMagicLink: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock("@/features/auth/actions", () => actionMocks);
```

Render the sign-in page with `error=callback`, then submit email and Google in
sequence. Configure the action results:

```ts
actionMocks.requestMagicLink.mockResolvedValue({
  status: "success",
  message: "Check your email for a secure sign-in link.",
});
actionMocks.signInWithGoogle.mockResolvedValue({
  status: "error",
  message: "Google sign-in is unavailable. Please try again.",
});
```

Assert that each new result replaces, rather than accompanies, the previous
message:

```ts
expect(
  page.getByText("We could not complete sign-in. Please try again."),
).toBeInTheDocument();

await user.type(
  page.getByRole("textbox", { name: "Email address" }),
  "person@example.com",
);
await user.click(page.getByRole("button", { name: "Send magic link" }));

expect(
  await page.findByText("Check your email for a secure sign-in link."),
).toBeInTheDocument();
expect(
  page.queryByText("We could not complete sign-in. Please try again."),
).not.toBeInTheDocument();

await user.click(page.getByRole("button", { name: "Continue with Google" }));

expect(
  await page.findByText("Google sign-in is unavailable. Please try again."),
).toBeInTheDocument();
expect(
  page.queryByText("Check your email for a secure sign-in link."),
).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm --filter web exec vitest run "src/app/(auth)/sign-in/page.test.tsx"
```

Expected: the callback error remains visible alongside the email result.

- [ ] **Step 3: Implement one active feedback source**

Add:

```ts
type AuthFeedbackSource = "magicLink" | "google";
const [feedbackSource, setFeedbackSource] =
  useState<AuthFeedbackSource | null>(null);
```

Wrap both form actions so submission selects its source before dispatch:

```ts
const submitMagicLink = (formData: FormData) => {
  setFeedbackSource("magicLink");
  magicLinkAction(formData);
};
const submitGoogle = (formData: FormData) => {
  setFeedbackSource("google");
  googleAction(formData);
};
```

Resolve a single feedback object:

```ts
const feedback =
  feedbackSource === "magicLink"
    ? magicLinkState.message
      ? {
          status:
            magicLinkState.status === "success" ? "success" : "error",
          title: magicLinkState.message,
        }
      : null
    : feedbackSource === "google"
      ? googleState.message
        ? { status: "error", title: googleState.message }
        : null
      : callbackFailed
        ? {
            status: "error",
            title: "We could not complete sign-in. Please try again.",
          }
        : null;
```

Render only:

```tsx
{feedback ? (
  <Banner status={feedback.status} title={feedback.title} />
) : null}
```

Pass `submitMagicLink` to `MagicLinkForm` and `submitGoogle` to the Google
form.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run:

```bash
pnpm --filter web exec vitest run "src/app/(auth)/sign-in/page.test.tsx"
```

Expected: all sign-in page tests pass.

- [ ] **Step 5: Commit the sign-in feedback fix**

```bash
git add "apps/web/src/app/(auth)/sign-in/page.tsx" \
  "apps/web/src/app/(auth)/sign-in/page.test.tsx"
git commit -m "fix: show only latest sign-in feedback"
```

### Task 2: Route authenticated users from the root page

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/page.test.ts`

**Interfaces:**
- Consumes: `createClient(new Headers())`, `supabase.auth.getUser()`, and the
  first `memberships.organization_id` row ordered by membership creation.
- Produces: redirects to `/sign-in`, `/onboarding`, or
  `/<organization-id>/discovery`.

- [ ] **Step 1: Write failing root routing tests**

Mock the server client and Next redirect:

```ts
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
```

Use a chainable membership query mock and add three cases:

```ts
await expect(Home()).rejects.toThrow("redirect:/sign-in");
await expect(Home()).rejects.toThrow("redirect:/onboarding");
await expect(Home()).rejects.toThrow(
  "redirect:/30000000-0000-4000-8000-000000000003/discovery",
);
```

Assert the membership query filters by `user_id`, orders by `created_at` then
`organization_id`, and limits the result to one.

- [ ] **Step 2: Run the focused root test and confirm RED**

Run:

```bash
pnpm --filter web exec vitest run src/app/page.test.ts
```

Expected: the null-rendering root page never calls redirect.

- [ ] **Step 3: Implement the server-side root router**

Replace the root page with:

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient(new Headers());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .order("organization_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!membership) {
    redirect("/onboarding");
  }

  redirect(`/${membership.organization_id}/discovery`);
}
```

- [ ] **Step 4: Run the focused root test and confirm GREEN**

Run:

```bash
pnpm --filter web exec vitest run src/app/page.test.ts
```

Expected: all root routing cases pass.

- [ ] **Step 5: Run regression checks**

Run:

```bash
pnpm --filter web exec vitest run \
  "src/app/(auth)/sign-in/page.test.tsx" \
  src/app/page.test.ts \
  src/app/auth/callback/route.test.ts
pnpm --filter web typecheck
pnpm --filter web lint
pnpm check:astryx
git diff --check
```

Expected: every command passes.

- [ ] **Step 6: Smoke-check the local callback destination**

Use the running development server to verify that a valid magic-link callback
redirects to `/`, which then redirects to onboarding or the user's Discovery
dashboard instead of rendering a blank document.

- [ ] **Step 7: Commit the root routing fix**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/page.test.ts \
  docs/design/plans/2026-07-25-sign-in-feedback-and-root-routing.md
git commit -m "fix: route users from authenticated root"
```
