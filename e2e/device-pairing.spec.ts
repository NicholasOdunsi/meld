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

test("adds a provider to the already-paired Mac instead of re-pairing it", async ({
  page,
}) => {
  await page.goto(
    "/00000000-0000-4000-8000-000000000001/settings/devices",
  );
  await page
    .getByRole("button", { name: "Connect Claude" })
    .click();

  // The Mac is already paired, so connecting a second provider drives a durable
  // provider setup on the existing device. It must NOT mint a fresh pairing
  // code: the single-Mac redeem RPC treats a new pairing as a device
  // replacement and would revoke the device the other provider runs on.
  await expect(page.getByTestId("setup-progress")).toBeVisible();
  await expect(page.getByText("Claude is ready")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("pairing-command")).toHaveCount(0);
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
