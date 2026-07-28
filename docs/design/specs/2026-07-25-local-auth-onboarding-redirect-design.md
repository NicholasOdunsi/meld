# Local Auth and Onboarding Redirect Design

## Goal

Make local manual testing reliable when Meld is opened at
`http://127.0.0.1:3000`. A user should request one magic link, create a
workspace, and arrive on that workspace's Members page without repeated
emails or manual URL editing.

## Current Failure

The local environment and Supabase callback use `127.0.0.1`, but the Next.js
development server does not currently allow that origin for development
resources. The workspace server action still succeeds, so the organization,
product, and admin membership are created, but the client-side navigation can
fail to run. The sign-in form also remains submittable after a magic link has
been sent, making repeated requests easy.

## Design

### Local origin

`http://127.0.0.1:3000` is the canonical local application origin. Next.js
will explicitly allow `127.0.0.1` as a development origin. Supabase already
allows the corresponding callback URL.

### Magic-link request

After `requestMagicLink` succeeds, the email input and submit button become
disabled. The button communicates that the link was sent. Errors leave the
form enabled so the user can correct the email or retry.

This is a client-side duplicate-submission guard for usability. Supabase's
existing rate limit and one-time-link behavior remain the security boundary.

### Workspace completion

Successful workspace creation navigates to
`/<organization-id>/settings/members`. The navigation uses replacement
semantics so the completed onboarding form is not left as a useful Back
destination. The success response must contain a non-empty organization ID;
otherwise the form reports an error instead of presenting a success state
that cannot navigate.

The organization RPC remains atomic and unchanged.

## Data Flow

1. The user opens `/sign-in?next=/onboarding` at `127.0.0.1`.
2. One successful OTP request disables the sign-in form.
3. The local Mailpit link returns through `/auth/callback`.
4. The callback exchanges the code, preserves the session cookie, and opens
   `/onboarding`.
5. Workspace creation returns the created organization ID.
6. The onboarding page replaces its route with the Members page.

## Error Handling

- Invalid email: show the existing field error and keep the form enabled.
- OTP provider failure: show the existing error and keep retry available.
- Missing organization ID after workspace creation: show a generic creation
  error and do not display a success state.
- Navigation failure caused by unavailable development resources is prevented
  by allowing the canonical local origin.

## Testing

- Assert the Next configuration allows the `127.0.0.1` development origin.
- Assert a successful magic-link state disables further submission and shows
  the sent state.
- Assert a successful workspace result with an organization ID navigates with
  replacement semantics to the Members page.
- Assert a malformed successful workspace result is treated as an error.
- Run unit tests, type checking, linting, the existing Playwright workflows,
  and a real local Mailpit sign-in/onboarding smoke test.

## Non-Goals

- Production domain configuration.
- Google OAuth setup.
- Invitation email delivery through Mailpit.
- Changes to organization, membership, or invitation database schemas.
