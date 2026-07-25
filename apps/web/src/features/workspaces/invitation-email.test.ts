import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resendSend: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: mocks.resendSend,
    };
  },
}));

import { sendInvitationEmail } from "./invitation-email";

const input = {
  to: "invitee@example.com",
  organizationName: "Northstar",
  invitedByName: "Owner Example",
  acceptUrl: "http://127.0.0.1:3000/invitations/token",
  idempotencyKey: "invitation/invitation-id",
};

describe("sendInvitationEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("INVITATION_FROM_EMAIL", "Meld <invitations@example.com>");
    delete process.env.INVITATION_EMAIL_TRANSPORT;
    delete process.env.MAILPIT_URL;
    delete process.env.RESEND_API_KEY;
  });

  it("sends local invitations through Mailpit's HTTP API", async () => {
    vi.stubEnv("INVITATION_EMAIL_TRANSPORT", "mailpit");
    vi.stubEnv("MAILPIT_URL", "http://127.0.0.1:54324");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ID: "mailpit-message-id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendInvitationEmail(input)).resolves.toEqual({
      providerId: "mailpit-message-id",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:54324/api/v1/send"),
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      From: {
        Email: "invitations@example.com",
        Name: "Meld",
      },
      To: [{ Email: "invitee@example.com" }],
      Subject: "Join Northstar on Meld",
      Text:
        "Owner Example invited you to Northstar. Accept: " +
        "http://127.0.0.1:3000/invitations/token",
      Tags: ["Meld invitation"],
      Headers: {
        "X-Meld-Idempotency-Key": "invitation/invitation-id",
      },
    });
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("fails when Mailpit rejects the message", async () => {
    vi.stubEnv("INVITATION_EMAIL_TRANSPORT", "mailpit");
    vi.stubEnv("MAILPIT_URL", "http://127.0.0.1:54324");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    await expect(sendInvitationEmail(input)).rejects.toThrow(
      "Invitation email delivery failed.",
    );
  });

  it("never allows the local Mailpit transport in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INVITATION_EMAIL_TRANSPORT", "mailpit");
    vi.stubEnv("MAILPIT_URL", "http://127.0.0.1:54324");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendInvitationEmail(input)).rejects.toThrow(
      "Local invitation email delivery is disabled.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Resend by default and preserves provider idempotency", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    mocks.resendSend.mockResolvedValue({
      data: { id: "resend-message-id" },
      error: null,
    });

    await expect(sendInvitationEmail(input)).resolves.toEqual({
      providerId: "resend-message-id",
    });
    expect(mocks.resendSend).toHaveBeenCalledWith(
      {
        from: "Meld <invitations@example.com>",
        to: "invitee@example.com",
        subject: "Join Northstar on Meld",
        text:
          "Owner Example invited you to Northstar. Accept: " +
          "http://127.0.0.1:3000/invitations/token",
      },
      {
        idempotencyKey: "invitation/invitation-id",
      },
    );
  });
});
