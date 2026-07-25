# Invite Members Onboarding

## Goal

Add a dedicated invite-members step immediately after organization creation. Users can send multiple invitations without leaving the step, then enter the workspace with `Skip for now`.

## Flow

1. Organization creation redirects to `/onboarding/<organization-id>/members`.
2. The page verifies that the signed-in user is an organization admin.
3. Sending an invitation uses the existing invitation action and email-delivery flow.
4. A successful invitation refreshes the page, clears the email field, and appears under `Invited people`.
5. The user remains on the page to invite more teammates.
6. `Skip for now` navigates to `/<organization-id>/discovery`.

The existing `/<organization-id>/settings/members` management page remains unchanged.

## Interface

- Use a frameless Astryx `AppShell` with the same wash background and centered placement as sign-in and organization creation.
- Use the Meld mark, `display-3` centered heading, and large secondary centered supporting text.
- Heading: `Invite your team.`
- Supporting text: `Add teammates to your Meld workspace`
- Use a wide but constrained centered content column so the invite row and people lists have more room than the sign-in form.
- Use a large email `TextInput` and large primary `Send invitation` button.
- Place a full-width secondary `Skip for now` button below the invite area.
- Show `People with access` and `Invited people` as edge-to-edge Astryx lists, not cards or tables.
- Member rows show an Avatar fallback, email, and Admin/Member status.
- Invitation rows show an Avatar fallback, email, and Invited status.
- Empty invited state explains that invitations will appear after they are sent.
- Preserve existing validation, delivery-error, and retry feedback.

## Authorization and errors

- Unauthenticated users are redirected to sign-in with the onboarding URL as `next`.
- Non-members receive not found.
- Non-admin members receive not found because this onboarding step is invitation-only.
- Loading failures use the existing safe organization-members error.

## Testing

- Organization creation action redirects to the new onboarding URL.
- The page renders the sign-in-style header, active members, invited people, invite form, and skip action.
- Sending an invitation remains on the page and refreshes the invited list.
- End-to-end onboarding verifies create → invite step → send invite → skip → Discovery Rooms.
- Run Astryx checks, unit tests, typecheck, lint, and production build.
