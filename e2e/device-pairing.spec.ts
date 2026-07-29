import {
  expect,
  test,
  type BrowserContext,
} from "@playwright/test";

const APPLICATION_ORIGIN = "http://127.0.0.1:3000";

async function authenticateContext(
  context: BrowserContext,
  user: { id: string; email: string; name: string },
) {
  await context.addCookies([
    {
      name: "meld-e2e-user-id",
      value: user.id,
      url: APPLICATION_ORIGIN,
    },
    {
      name: "meld-e2e-user-email",
      value: user.email,
      url: APPLICATION_ORIGIN,
    },
    {
      name: "meld-e2e-user-name",
      value: user.name,
      url: APPLICATION_ORIGIN,
    },
  ]);
}

test.beforeEach(async ({ context }) => {
  await authenticateContext(context, {
    id: "10000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    name: "Owner Example",
  });
});

test("shows a pairing command for the selected provider", async ({
  page,
}) => {
  await page.goto(
    "/00000000-0000-4000-8000-000000000001/settings/devices",
  );
  await page
    .getByRole("button", { name: "Connect Claude" })
    .click();

  const command = page.getByTestId("pairing-command");
  await expect(command).toContainText(
    "pnpm --filter @meld/connector cli -- pair --join",
  );
  await expect(page.getByTestId("pairing-code")).toHaveText(
    /^[0-9A-Z]{8}$/,
  );
});

test("revoking a device removes it from the list", async ({
  page,
}) => {
  await page.goto(
    "/00000000-0000-4000-8000-000000000001/settings/devices",
  );
  await expect(page.getByText("Ada's MacBook")).toBeVisible();

  await page.getByRole("button", { name: "Revoke" }).click();
  await page
    .getByRole("button", { name: "Revoke device" })
    .click();

  await expect(page.getByText("Ada's MacBook")).toBeHidden();
});
