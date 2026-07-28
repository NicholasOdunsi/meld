# Frameless Sign-In Implementation Plan

**Goal:** Replace the sign-in Card with the approved centered, frameless Astryx layout while preserving email magic-link and Google authentication.

**Architecture:** Keep the existing client-side form boundaries and server actions. Change only the sign-in composition, add the supplied Meld mark as a themed page asset and static favicon, and extend the focused component test.

**Tech Stack:** Next.js 16 App Router, React 19, Astryx 0.1.8, Vitest, Testing Library

## Global Constraints

- Use Astryx components, props, and tokens for page layout and styling.
- Preserve the existing email magic-link, Google OAuth, safe redirect, loading, success, and error behavior.
- Do not add password, GitHub, sign-up, or account-recovery flows.
- Keep the page responsive and system-theme aware.

---

### Task 1: Apply and verify the frameless sign-in presentation

**Files:**
- Create: `apps/web/public/meld-mark.svg`
- Create: `apps/web/src/app/icon.svg`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/app/(auth)/sign-in/page.tsx`
- Modify: `apps/web/src/app/(auth)/sign-in/page.test.tsx`

**Interfaces:**
- Consumes: `requestMagicLink(previousState, formData)` and `signInWithGoogle(previousState, formData)` from `@/features/auth/actions`
- Produces: the existing default `SignInPage` and named `MagicLinkForm` exports with unchanged call signatures

- [x] **Step 1: Extend the component test**

Render `SignInPage` with resolved empty search parameters and assert that “Welcome back”, “Email me a sign-in link”, and “Continue with Google” are visible. Retain the existing successful-magic-link disabled-state test.

- [x] **Step 2: Run the focused test and verify the new assertion fails**

Run: `pnpm --filter @meld/web test -- 'src/app/(auth)/sign-in/page.test.tsx'`

Expected: FAIL because the current heading is “Sign in to Meld”.

- [x] **Step 3: Add the logo assets and implement the frameless layout**

Copy the supplied mark geometry into:

- `public/meld-mark.svg`, using `var(--color-background-inverted)` for its compact background and `var(--color-on-dark)` for the white mark.
- `src/app/icon.svg`, using a fixed dark neutral background and white mark so the favicon remains visible independently of page CSS.

In `page.tsx`, remove `Card`, render the logo with `next/image`, change the heading to “Welcome back”, retain a concise supporting line, place the email form before a Divider labeled “or continue with”, and render the Google Button with the `Google` brand icon from `@boxicons/react`.

Constrain the frameless `VStack` to the existing token-based maximum width and retain `AppShell`, `Center`, Banner feedback, both forms, and all action state.

- [x] **Step 4: Run focused and project verification**

Run:

```bash
pnpm --filter @meld/web test -- 'src/app/(auth)/sign-in/page.test.tsx'
pnpm check:astryx
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm --filter @meld/web build
```

Expected: all commands pass.

- [x] **Step 5: Review the final diff**

Confirm there is no enclosing Card, no authentication action change, no raw layout element, no page-specific theme override, and no unrelated file modification.
