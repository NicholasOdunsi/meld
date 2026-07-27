import type { FullConfig } from "@playwright/test";

// `next dev` compiles a route the first time it is requested, and that cost
// lands inside whichever assertion happens to trigger it: on a cold checkout a
// single navigation was observed taking 68s, of which 65s was compilation.
// Tests then fail on timeouts that have nothing to do with the behaviour under
// test. Requesting every route once up front moves that cost here, where no
// per-test timeout applies.
//
// The suite cannot run against a production build instead: the MELD_E2E_FAKE_*
// gates deliberately refuse to activate when NODE_ENV is "production", which is
// what keeps them from ever being reachable in a deployed environment.
const ROUTES = [
  "/",
  "/sign-in",
  "/onboarding",
  "/onboarding/00000000-0000-4000-8000-000000000000/setup",
  "/onboarding/00000000-0000-4000-8000-000000000000/members",
  "/00000000-0000-4000-8000-000000000000",
  "/00000000-0000-4000-8000-000000000000/discovery",
  "/00000000-0000-4000-8000-000000000000/discovery/00000000-0000-4000-8000-000000000001",
  "/00000000-0000-4000-8000-000000000000/settings/members",
  "/invitations/warmup-token",
];

// The same cookies the specs authenticate with, so warm-up requests render the
// authenticated page rather than stopping at a redirect.
const COOKIE = [
  "meld-e2e-user-id=10000000-0000-4000-8000-000000000001",
  "meld-e2e-user-email=owner@example.com",
  "meld-e2e-user-name=Owner Example",
].join("; ");

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL;

  if (!baseURL) {
    return;
  }

  for (const route of ROUTES) {
    // Status is irrelevant; compiling the route is the point.
    await fetch(new URL(route, baseURL), {
      headers: { cookie: COOKIE },
    }).catch(() => undefined);
  }
}
