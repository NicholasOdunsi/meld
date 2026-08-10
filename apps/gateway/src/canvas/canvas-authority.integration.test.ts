import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { createCanvasAuthorityLeaseFactory } from "./canvas-authority";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const OTHER_ROOM_ID = "40000000-0000-4000-8000-000000000002";

const clients: ReturnType<typeof postgres>[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.end()));
});

describe.skipIf(!process.env.GATEWAY_DATABASE_URL)(
  "PostgreSQL canvas authority",
  () => {
    it("holds one session advisory lease per organization and room", async () => {
      const firstClient = postgres(process.env.GATEWAY_DATABASE_URL!, { max: 1 });
      const secondClient = postgres(process.env.GATEWAY_DATABASE_URL!, { max: 1 });
      clients.push(firstClient, secondClient);
      const firstFactory = createCanvasAuthorityLeaseFactory(firstClient);
      const secondFactory = createCanvasAuthorityLeaseFactory(secondClient);

      const firstLease = await firstFactory.acquire(ORGANIZATION_ID, ROOM_ID);
      expect(firstLease).not.toBeNull();
      await expect(
        secondFactory.acquire(ORGANIZATION_ID, ROOM_ID),
      ).resolves.toBeNull();
      const differentLease = await secondFactory.acquire(
        ORGANIZATION_ID,
        OTHER_ROOM_ID,
      );
      expect(differentLease).not.toBeNull();

      await firstLease!.release();
      const secondLease = await secondFactory.acquire(
        ORGANIZATION_ID,
        ROOM_ID,
      );
      expect(secondLease).not.toBeNull();

      await differentLease!.release();
      await secondLease!.release();
    });
  },
);
