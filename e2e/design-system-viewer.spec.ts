import { expect, test } from "@playwright/test";

// Fixture: the root E2E workspace (apps/web/src/features/workspaces/e2e-fake.ts's
// E2E_WORKSPACE_ID). Its active design-system profile version is seeded
// directly into the fake store at init (apps/web/src/features/rooms/e2e-fake.ts's
// E2E_WORKSPACE_DESIGN_SYSTEM_VERSION_ID) rather than requiring this spec to
// drive the upload -> poll -> distill UI flow itself: one real "primary"
// color token and one real "button" component (html:
// `<button class="ds-button">Continue</button>`, compiled componentCss
// carrying `.ds-button`), matching what a real distillation would extract.
// That runtime upload/distill flow is covered on its own dynamically-created
// workspace by e2e-fake.test.ts's "fake design profile distillation" describe
// block -- this spec's job is only to prove the *page*
// (apps/web/src/app/(app)/[workspaceId]/design-system/page.tsx ->
// DesignSystemView) renders that data through a real browser.
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";

test.beforeEach(async ({ context }) => {
  const appBaseUrl =
    `http://127.0.0.1:${process.env.MELD_CANVAS_E2E_APP_PORT ?? 18788}`;
  await context.addCookies([
    { name: "meld-e2e-user-id", value: OWNER_ID, url: appBaseUrl },
    {
      name: "meld-e2e-user-email",
      value: "owner@example.com",
      url: appBaseUrl,
    },
    {
      name: "meld-e2e-user-name",
      value: "Owner Example",
      url: appBaseUrl,
    },
  ]);
});

test("the workspace Design System viewer renders a token swatch and a live component preview", async ({
  page,
}) => {
  const appBaseUrl =
    `http://127.0.0.1:${process.env.MELD_CANVAS_E2E_APP_PORT ?? 18788}`;
  const designSystemPath = `/${WORKSPACE_ID}/design-system`;
  await page.goto(new URL(designSystemPath, appBaseUrl).toString());

  await expect(page.getByRole("heading", { name: "Design System" })).toBeVisible();

  // A real token swatch, not the "No colors distilled yet." empty state --
  // proof the profile's colors array (DesignSystemView's ColorSwatch) reached
  // the page with the fixture's "primary" color token name.
  const swatch = page.getByTestId("color-swatch").first();
  await expect(swatch).toBeVisible();
  await expect(swatch.getByText("primary")).toBeVisible();

  // The button component's live sandboxed preview -- ComponentPreviewCard
  // only renders the iframe when assembleValidatedPrototype succeeds against
  // the component's real html/css, so this also proves the component wasn't
  // rejected by the screen-safety gate and fell back to the "Described, not
  // generated" chip instead.
  const preview = page.locator('iframe[title$="preview"]').first();
  await expect(preview).toBeAttached();
  await expect(preview).toHaveAttribute("title", "button preview");
  await expect(preview).toHaveAttribute("sandbox", "");

  const srcDoc = await preview.getAttribute("srcdoc");
  expect(srcDoc).not.toBeNull();
  // The compiled component stylesheet (componentCss) and the component's own
  // markup both round-tripped through assembleValidatedPrototype into the
  // rendered doc.
  expect(srcDoc).toContain("ds-button");
  expect(srcDoc).toContain("Continue");
});
