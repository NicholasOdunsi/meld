import { chromium, type FullConfig } from "@playwright/test";

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
const E2E_WORKSPACE_ID =
  "00000000-0000-4000-8000-000000000001";
const E2E_SECOND_WORKSPACE_ID =
  "00000000-0000-4000-8000-000000000002";
const E2E_ROOM_ID = "40000000-0000-4000-8000-000000000001";
const E2E_EMPTY_ROOM_ID = "40000000-0000-4000-8000-000000000002";
const E2E_PRD_ROOM_ID = "40000000-0000-4000-8000-000000000003";
const E2E_PROPOSAL_ROOM_ID = "40000000-0000-4000-8000-000000000004";

const ROUTES = [
  "/",
  "/sign-in",
  "/onboarding",
  "/onboarding/00000000-0000-4000-8000-000000000000/setup",
  "/onboarding/00000000-0000-4000-8000-000000000000/members",
  `/${E2E_WORKSPACE_ID}`,
  `/${E2E_WORKSPACE_ID}/rooms`,
  `/${E2E_WORKSPACE_ID}/rooms/${E2E_ROOM_ID}`,
  `/${E2E_WORKSPACE_ID}/rooms/${E2E_ROOM_ID}?tab=prd`,
  `/${E2E_WORKSPACE_ID}/rooms/${E2E_ROOM_ID}?tab=prototype`,
  // The lifecycle fixtures, and each surface the lifecycle spec opens. Every
  // one of these is a distinct render path `next dev` compiles on first
  // request, and the decisions and overview surfaces are only reachable part
  // way through a flow, where a compile would land inside an assertion.
  `/${E2E_WORKSPACE_ID}/rooms/${E2E_EMPTY_ROOM_ID}`,
  `/${E2E_WORKSPACE_ID}/rooms/${E2E_EMPTY_ROOM_ID}?tab=user-flows`,
  `/${E2E_WORKSPACE_ID}/rooms/${E2E_PRD_ROOM_ID}?tab=prd`,
  `/${E2E_WORKSPACE_ID}/rooms/${E2E_PROPOSAL_ROOM_ID}`,
  `/${E2E_WORKSPACE_ID}/rooms/${E2E_PROPOSAL_ROOM_ID}?tab=decisions`,
  `/${E2E_WORKSPACE_ID}/rooms/${E2E_PROPOSAL_ROOM_ID}?tab=overview`,
  `/${E2E_SECOND_WORKSPACE_ID}`,
  `/${E2E_WORKSPACE_ID}/settings/members`,
  // The sidebar left the workspace root when the deck took it over, so the
  // navigation specs now enter each workspace through Settings -- including
  // the partner workspace, whose members page was never warmed before.
  `/${E2E_SECOND_WORKSPACE_ID}/settings/members`,
  `/${E2E_WORKSPACE_ID}/design-system`,
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

  await warmUserFlowSurface(baseURL);
}

// The User Flows surface loads client-side (`dynamic(..., { ssr: false })`), so
// a plain request never compiles it -- only a browser does. Left cold, the
// first Room to open it pays for that compile mid-test, and the Fast Refresh
// round it triggers lands on top of the client navigation that asked for it and
// puts the old URL back: the surface silently fails to open. Warming it here
// against the pre-seeded Room that already has a user flow keeps that cost, and
// that rebuild, out of every spec.
async function warmUserFlowSurface(baseURL: string) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    await context.addCookies(
      COOKIE.split("; ").map((pair) => {
        const [name, value] = pair.split("=");
        return { name: name!, value: value!, url: baseURL };
      }),
    );
    const page = await context.newPage();
    await page.goto(
      `/${E2E_WORKSPACE_ID}/rooms/${E2E_ROOM_ID}?tab=user-flows`,
      { timeout: 120_000 },
    );
    // Either terminal state means the surface's client bundle has been built.
    await page
      .locator(
        '[data-testid="user-flow-trial-surface"], [data-testid="user-flow-trial-error"]',
      )
      .first()
      .waitFor({ timeout: 120_000 });
  } catch {
    // A cold warm-up that does not settle is not a reason to refuse to run the
    // suite; it only means the first spec to open the surface pays for it.
  } finally {
    await browser.close();
  }
}
