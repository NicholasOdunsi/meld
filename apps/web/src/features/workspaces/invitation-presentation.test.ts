import { describe, expect, it } from "vitest";
import { getInvitationPresentation } from "./invitation-presentation";

const BASE_INVITATION = {
  acceptedAt: null,
  revokedAt: null,
  expiresAt: "2026-08-01T00:00:00.000Z",
} as const;

describe("invitation presentation", () => {
  it("lets an admin retry a stranded pending invitation", () => {
    expect(
      getInvitationPresentation({
        ...BASE_INVITATION,
        deliveryStatus: "pending",
        isAdmin: true,
        now: new Date("2026-07-25T00:00:00.000Z").getTime(),
      }),
    ).toMatchObject({
      state: "Sending",
      canRetry: true,
      canRevoke: true,
    });
  });

  it("lets an admin explicitly revoke an expired invitation", () => {
    expect(
      getInvitationPresentation({
        ...BASE_INVITATION,
        deliveryStatus: "failed",
        isAdmin: true,
        now: new Date("2026-08-02T00:00:00.000Z").getTime(),
      }),
    ).toMatchObject({
      state: "Expired",
      canRetry: false,
      canRevoke: true,
    });
  });
});
