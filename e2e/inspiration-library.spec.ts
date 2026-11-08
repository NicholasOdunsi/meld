import { crc32, deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// Fixtures from apps/web/src/features/rooms/e2e-fake.ts and
// apps/web/src/features/inspiration/inspiration-fake.ts.
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000005";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";

// A real, decodable 2x2 PNG in a random colour, so reruns against the same
// fake store never collide with the duplicate check.
function solidPng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const [r, g, b] = [0, 1, 2].map(() => Math.floor(Math.random() * 256));
  const row = Buffer.from([0, r, g, b, r, g, b]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat([row, row]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test.beforeEach(async ({ context }, testInfo) => {
  const origin = testInfo.project.use.baseURL;
  if (typeof origin !== "string") throw new Error("Playwright baseURL is required for inspiration E2E auth.");
  await context.addCookies([
    { name: "meld-e2e-user-id", value: OWNER_ID, url: origin },
    { name: "meld-e2e-user-email", value: "owner@example.com", url: origin },
    { name: "meld-e2e-user-name", value: "Owner Example", url: origin },
  ]);
});

test("save to the library, add to a room, remove from the room, then delete", async ({ page }) => {
  await page.goto(`/${WORKSPACE_ID}/inspiration`);
  await expect(page.getByRole("heading", { name: "Inspiration" })).toBeVisible();

  const tilesBefore = await page.getByTestId("inspiration-tile").count();
  await page.locator('input[type="file"]').setInputFiles({ name: "nav.png", mimeType: "image/png", buffer: solidPng() });
  await expect(page.getByTestId("inspiration-tile")).toHaveCount(tilesBefore + 1);

  // Newest first: the upload is the first tile.
  const tile = page.getByTestId("inspiration-tile").first();
  await tile.getByRole("checkbox", { name: "Select image" }).check();
  await page.getByRole("button", { name: "Add to room…" }).click();
  await page.getByRole("button", { name: "Add 1 image" }).click();
  await expect(page.getByText("Added 1 image to Design Room.")).toBeVisible();

  await page.goto(`/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=inspiration`);
  await expect(page.getByTestId("room-inspiration")).toBeVisible();
  const roomTiles = page.getByTestId("room-inspiration").getByTestId("inspiration-tile");
  const roomCount = await roomTiles.count();
  await roomTiles.first().getByRole("checkbox", { name: "Select image" }).check();
  await page.getByRole("button", { name: "Remove from room" }).click();
  await expect(roomTiles).toHaveCount(roomCount - 1);

  await page.goto(`/${WORKSPACE_ID}/inspiration`);
  await expect(page.getByTestId("inspiration-tile")).toHaveCount(tilesBefore + 1);
  await page.getByTestId("inspiration-tile").first().getByRole("button", { name: /^Open / }).click();
  await page.getByRole("button", { name: "Delete image" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByTestId("inspiration-tile")).toHaveCount(tilesBefore);
});
