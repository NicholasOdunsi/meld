import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

import {
  fakeCreateOrganization,
  fakeInviteMember,
  fakeRevokeInvitation,
  listFakeOrganizationPeople,
} from "./e2e-fake";

describe("workspace E2E fake invitation lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T12:00:00.000Z"));
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
    vi.stubEnv(
      "INVITATION_TOKEN_SECRET",
      "6Lr5Xn3p2QVv8qFsa0RMXKFF23alHmmad4FUwx_JQDU",
    );
    const values: Record<string, string> = {
      "meld-e2e-user-id":
        "10000000-0000-4000-8000-000000000001",
      "meld-e2e-user-email": "owner@example.com",
      "meld-e2e-user-name": "Owner Example",
    };
    mocks.cookies.mockResolvedValue({
      get(name: string) {
        const value = values[name];
        return value ? { value } : undefined;
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("requires explicit revoke before replacing an expired invitation", async () => {
    const organization = await fakeCreateOrganization({
      name: "Northstar",
      productName: "Mobile app",
    });
    const input = {
      organizationId: organization.organizationId,
      email: "expired@example.com",
      productRole: "engineer" as const,
    };
    const original = await fakeInviteMember(input);

    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);

    await expect(fakeInviteMember(input)).rejects.toThrow(
      "An active invitation already exists; revoke it before creating another",
    );

    const beforeRevoke = await listFakeOrganizationPeople(
      organization.organizationId,
    );
    expect(beforeRevoke?.invitations).toEqual([
      expect.objectContaining({
        id: original.invitationId,
        revoked_at: null,
      }),
    ]);

    await fakeRevokeInvitation({
      organizationId: organization.organizationId,
      invitationId: original.invitationId,
    });
    const replacement = await fakeInviteMember(input);

    expect(replacement.invitationId).not.toBe(original.invitationId);
    const afterReplacement = await listFakeOrganizationPeople(
      organization.organizationId,
    );
    expect(afterReplacement?.invitations).toEqual([
      expect.objectContaining({
        id: original.invitationId,
        revoked_at: expect.any(String),
      }),
      expect.objectContaining({
        id: replacement.invitationId,
        revoked_at: null,
      }),
    ]);
  });
});
