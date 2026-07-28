# Sign-In Feedback and Root Routing Design

## Goal

Ensure sign-in presents only the newest relevant feedback banner and that a
successful magic-link callback never lands on a blank page.

## Current Failures

The sign-in page renders magic-link, Google, and callback feedback
independently. A callback error stored in the URL can therefore remain visible
after a newer magic-link request succeeds, producing contradictory banners.

A successful magic-link callback defaults to `/`. The root page currently
returns `null`, so authentication succeeds but the user sees a blank screen.

## Design

### Single sign-in banner

The sign-in page will render one shared `Banner`. It will track which sign-in
method the user most recently submitted:

- Before any new submission, a callback error from the URL is eligible.
- Submitting the email form makes magic-link feedback the only eligible
  feedback.
- Submitting the Google form makes Google feedback the only eligible feedback.
- The selected action's success or error message replaces all older feedback.
- If the newest action does not yet have a result, no stale banner is shown.

The individual forms keep their existing action state and behavior. Only
feedback selection and rendering are centralized.

### Authenticated root routing

The root page will become an async server-side routing page:

1. Load the current Supabase user.
2. If no user exists, redirect to `/sign-in`.
3. Load the user's oldest organization membership by `created_at`, using
   `organization_id` as a deterministic tie-breaker.
4. If no membership exists, redirect to `/onboarding`.
5. If a membership exists, redirect to
   `/<organization-id>/discovery`.

This keeps destination selection at the application entry point. The auth
callback remains responsible only for exchanging the code and honoring a safe
`next` path.

## Data Flow

### Feedback

1. A callback failure opens `/sign-in?error=callback` and displays one error.
2. The user submits a sign-in method.
3. The submitted method becomes the active feedback source immediately.
4. Its returned message is rendered in the single banner slot.
5. Feedback from all older sources remains hidden.

### Successful magic link

1. The callback exchanges the one-time code for a session.
2. With the default `next=/`, the callback redirects to `/`.
3. The root page reads the authenticated user and membership.
4. A new user is sent to `/onboarding`; a returning organization member is
   sent to their Discovery dashboard.

## Error Handling

- Failed or expired callback links return to sign-in with the existing callback
  error.
- A newer form submission supersedes that callback error.
- A membership query that returns no row is treated as a new-user state and
  redirects to onboarding.
- The root page does not render an intermediate visual state because every
  resolved state redirects.

## Testing

- Verify a callback error is the only initial banner.
- Verify a newer magic-link success hides the callback error and still renders
  only one banner.
- Verify a newer Google error hides older feedback and still renders only one
  banner.
- Verify an unauthenticated root request redirects to sign-in.
- Verify an authenticated user without memberships redirects to onboarding.
- Verify an authenticated member redirects to the selected organization's
  Discovery dashboard.
- Run focused Vitest tests, type checking, linting, Astryx convention checks,
  and a local callback smoke check.

## Non-Goals

- Changing magic-link expiry or one-time-use behavior.
- Changing Google OAuth provider configuration.
- Adding an organization switcher or last-visited organization preference.
- Changing callback URL security validation.
