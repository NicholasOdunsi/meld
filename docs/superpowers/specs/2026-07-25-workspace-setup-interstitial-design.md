# Workspace Setup Interstitial

## Goal

After the invite step, show a short branded screen that teaches what Meld does
before the user reaches their workspace.

## Honest framing

Nothing is actually set up here. The organization and its product are created on
the organization step, and the invite step needs no follow-up work. This screen
is a deliberate six-second brand moment whose purpose is to be read, not to wait
on a task. It must not claim progress it cannot measure, so it shows no progress
bar and no spinner.

## Flow

1. `Done` and `Skip for now` both navigate to
   `/onboarding/<organization-id>/setup`.
2. The page confirms the signed-in user belongs to the organization.
3. Three tips display for two seconds each, six seconds in total.
4. The page replaces itself with `/<organization-id>/discovery`.

`Done` and `Skip for now` behave identically by design: both mean "take me to my
workspace", and neither implies more invitations are pending.

Users create their own Discovery Rooms, so the destination stays the Discovery
Rooms list.

## Interface

- Frameless Astryx `AppShell` with the same wash background, centered placement,
  and content width as sign-in, organization creation, and the invite step.
- The Meld mark sits above the heading and reserves the slot for the forthcoming
  mascot, so introducing the mascot changes one element rather than the layout.
- Heading: `Setting up your workspace.` using the onboarding `display-3` style.
- One tip at a time in Astryx `body` secondary centered text. This keeps the
  tips readable while making them quieter and smaller than the heading.
- Each new tip fades in using the design system's duration and easing tokens.
  Under `prefers-reduced-motion` the tip appears without a transition.
- The tip area reserves the height of its longest tip so the column does not
  shift when a tip wraps.

## Tips

1. `Invite your team into Discovery Rooms to share research, evidence, and decisions.`
2. `Mention the Product Agent to ask questions, challenge assumptions, and get direction.`
3. `Connect your own Codex or Claude subscription — AI runs on your account, never ours.`

Each tip describes a capability the product checklist already claims.

## Navigation details

- The destination is prefetched on mount so the workspace appears immediately
  when the timer ends.
- Navigation uses `replace`, not `push`, so returning back never lands on a
  setup screen for a workspace that is already set up.
- The final tip remains visible until navigation instead of advancing past the
  end of the list.

## Authorization and errors

- Unauthenticated users are redirected to sign-in with the setup URL as `next`.
- Non-members receive not found, immediately rather than after six seconds.
- Membership alone is required; unlike the invite step this screen is not
  admin-only, because it only shows product information.

## Testing

- Unit tests with fake timers assert the heading, the first tip, each later tip
  after its interval, and that navigation replaces the route with the discovery
  path after six seconds.
- The end-to-end onboarding test expects the setup screen between `Skip for now`
  and Discovery Rooms.
- Run Astryx checks, unit tests, typecheck, lint, and the production build.
