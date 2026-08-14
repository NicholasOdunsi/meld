import { expect, test } from "@playwright/test";

const E2E_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
// Seeded already in the Design stage with zero screens built -- the fixture
// that proves the Prototype surface (and the chat-to-screen composer on it)
// is reachable before any screen exists, not just once one is built.
const E2E_DESIGN_ROOM_ID = "40000000-0000-4000-8000-000000000005";

test.beforeEach(async ({ context }, testInfo) => {
  const applicationOrigin = testInfo.project.use.baseURL;
  if (typeof applicationOrigin !== "string") {
    throw new Error(
      "Playwright baseURL is required for chat-to-screen E2E auth.",
    );
  }

  await context.addCookies([
    {
      name: "meld-e2e-user-id",
      value: "10000000-0000-4000-8000-000000000001",
      url: applicationOrigin,
    },
    {
      name: "meld-e2e-user-email",
      value: "owner@example.com",
      url: applicationOrigin,
    },
    {
      name: "meld-e2e-user-name",
      value: "Owner Example",
      url: applicationOrigin,
    },
  ]);
});

test("typing an instruction generates a screen, and Regenerate produces a second version", async ({
  page,
}) => {
  await page.goto(
    `/${E2E_WORKSPACE_ID}/rooms/${E2E_DESIGN_ROOM_ID}?tab=prototype`,
  );

  // The Prototype surface is reachable before any screen has been built,
  // because the Room is already in the Design stage -- the composer that
  // generates the first screen has to live somewhere before there is a
  // screen to click into.
  await expect(page.getByRole("link", { name: "Prototype" })).toBeVisible();
  await expect(page.getByText("No screens built yet")).toBeVisible();

  const composer = page.getByTestId("screen-composer");
  await expect(composer).toBeVisible();
  const instructionField = composer.getByRole("textbox", {
    name: "Screen instruction",
  });
  const generateButton = composer.getByRole("button", { name: "Generate" });

  await instructionField.fill(
    "A clean sign-in screen with a primary button.",
  );
  await generateButton.click();

  // A pending state shows while the fake connector "works".
  await expect(composer.getByText("Building screen")).toBeVisible();

  // The screen materializes: the sandboxed iframe swaps in the generated
  // markup, carrying the typed instruction.
  await expect(page.getByTitle("Prototype preview (1 screen)")).toBeVisible({
    timeout: 30_000,
  });
  const prototype = page.frameLocator(
    'iframe[title="Prototype preview (1 screen)"]',
  );
  await expect(
    prototype.getByText("A clean sign-in screen with a primary button."),
  ).toBeVisible();

  // The composer's own list now shows the screen as built, with a
  // Regenerate action.
  const regenerateButton = composer.getByRole("button", {
    name: "Regenerate",
  });
  await expect(regenerateButton).toBeVisible();

  // Regenerating with a new instruction appends a second, distinct version --
  // the same append-only history restore_design_screen_version relies on.
  await instructionField.fill(
    "Swap to a two-column layout with social login.",
  );
  await regenerateButton.click();

  await expect(
    prototype.getByText("Swap to a two-column layout with social login."),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    prototype.getByText("A clean sign-in screen with a primary button."),
  ).toHaveCount(0);

  // The prior version is now offered for restore.
  await expect(composer.getByText("Prior versions")).toBeVisible();
  await expect(
    composer.getByRole("button", { name: "Restore" }),
  ).toBeVisible();
});
