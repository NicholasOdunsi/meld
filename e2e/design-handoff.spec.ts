import { expect, test } from "@playwright/test";

// Fixtures from apps/web/src/features/rooms/e2e-fake.ts
// (E2E_DESIGN_HANDOFF_ROOM_ID / E2E_DESIGN_STALENESS_ROOM_ID): two dedicated
// Design-stage rooms, each with zero screens built. Dedicated (not shared
// with design-chat-to-screen.spec.ts's E2E_DESIGN_ROOM_ID) because this spec
// drives a real stage transition -- sharing a room with another spec would
// either strand a screen that spec generated, or move a room a later spec
// still expects to find in Design.
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const HANDOFF_ROOM_ID = "40000000-0000-4000-8000-000000000008";
const STALENESS_ROOM_ID = "40000000-0000-4000-8000-000000000009";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";

test.beforeEach(async ({ context }, testInfo) => {
  const applicationOrigin = testInfo.project.use.baseURL;
  if (typeof applicationOrigin !== "string") {
    throw new Error(
      "Playwright baseURL is required for design-handoff E2E auth.",
    );
  }

  await context.addCookies([
    { name: "meld-e2e-user-id", value: OWNER_ID, url: applicationOrigin },
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

test("building and reviewing a screen readies the Design checklist, and moving to Development shows the handoff summary", async ({
  page,
}) => {
  const roomPath = `/${WORKSPACE_ID}/rooms/${HANDOFF_ROOM_ID}`;

  // Build the room's first screen through the chat-to-screen composer on the
  // Prototype surface -- reachable before any screen exists because the room
  // is already in the Design stage.
  await page.goto(`${roomPath}?tab=prototype`);
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
  await expect(composer.getByText("Building screen")).toBeVisible();
  await expect(page.getByTitle("Prototype preview (1 screen)")).toBeVisible({
    timeout: 30_000,
  });

  // The stage coaching panel lives on the Conversation surface.
  await page.goto(roomPath);
  const panel = page.getByTestId("stage-coaching-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Screens designed")).toBeVisible();

  // "Screens designed" is auto-satisfied by the built screen, but "Design
  // reviewed" is a manual confirmation -- the checklist isn't fully ready
  // until it's checked off too.
  await expect(page.getByTestId("stage-coaching-pill")).not.toContainText(
    "Ready",
  );
  await panel
    .getByRole("button", { name: 'Confirm "Design reviewed"' })
    .click();
  await expect(
    panel.getByRole("button", { name: 'Undo "Design reviewed"' }),
  ).toBeVisible();
  await expect(page.getByTestId("stage-coaching-pill")).toContainText(
    "Ready",
  );

  // Move the room forward -- the fake set_room_stage's Design -> Development
  // branch pushes a handoff snapshot, mirroring the real RPC.
  await panel.getByRole("button", { name: "Move to Development" }).click();

  const summary = page.getByTestId("handoff-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("1 screen handed off");
  await expect(page.getByTestId("handoff-preview")).toBeVisible();
});

test("regenerating a reviewed screen re-gates the Design checklist with a staleness detail", async ({
  page,
}) => {
  const roomPath = `/${WORKSPACE_ID}/rooms/${STALENESS_ROOM_ID}`;

  await page.goto(`${roomPath}?tab=prototype`);
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
  await expect(page.getByTitle("Prototype preview (1 screen)")).toBeVisible({
    timeout: 30_000,
  });

  // Mark the design reviewed while it is still fresh -- the checklist reads
  // ready.
  await page.goto(roomPath);
  const panel = page.getByTestId("stage-coaching-panel");
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: 'Confirm "Design reviewed"' })
    .click();
  await expect(
    panel.getByRole("button", { name: 'Undo "Design reviewed"' }),
  ).toBeVisible();
  await expect(page.getByTestId("stage-coaching-pill")).toContainText(
    "Ready",
  );

  // Regenerate the same screen -- its new version lands after the review
  // timestamp, so the review is no longer fresh.
  await page.goto(`${roomPath}?tab=prototype`);
  const regenerateButton = composer.getByRole("button", {
    name: "Regenerate",
  });
  await instructionField.fill(
    "Swap to a two-column layout with social login.",
  );
  await regenerateButton.click();
  await expect(
    page
      .frameLocator('iframe[title="Prototype preview (1 screen)"]')
      .getByText("Swap to a two-column layout with social login."),
  ).toBeVisible({ timeout: 30_000 });

  // Back on the Conversation surface, the checklist re-gates: "Design
  // reviewed" is no longer done, its detail explains why, and the stage as a
  // whole is no longer ready to move on.
  await page.goto(roomPath);
  await expect(panel).toBeVisible();
  await expect(page.getByText("design changed since review")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: 'Confirm "Design reviewed"' }),
  ).toBeVisible();
  await expect(page.getByTestId("stage-coaching-pill")).not.toContainText(
    "Ready",
  );
});
