import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  sendInvitationEmail: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string, type: string) => {
    throw new Error(`redirect:${type}:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("./invitation-email", () => ({
  sendInvitationEmail: mocks.sendInvitationEmail,
}));

vi.mock("next/navigation", () => ({
  redirect: navigationMocks.redirect,
}));

import { createWorkspaceFromForm } from "./actions";
import {
  acceptInvitation,
  createWorkspace,
  inviteMember,
  retryInvitationDelivery,
} from "./operations";

function workspaceFormData(
  name: string,
  logo = new File(["logo"], "northstar.png", {
    type: "image/png",
  }),
) {
  const formData = new FormData();
  formData.set("name", name);
  formData.set("logo", logo);
  return formData;
}

describe("workspace actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    navigationMocks.redirect.mockImplementation(
      (url: string, type: string) => {
        throw new Error(`redirect:${type}:${url}`);
      },
    );
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.INVITATION_TOKEN_SECRET =
      "6Lr5Xn3p2QVv8qFsa0RMXKFF23alHmmad4FUwx_JQDU";
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
          user_metadata: { full_name: "Owner Example" },
        },
      },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
      storage: { from: mocks.storageFrom },
    });
    mocks.storageFrom.mockReturnValue({
      upload: mocks.upload,
      remove: mocks.remove,
    });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
  });

  it("creates a workspace, admin membership, and default project atomically", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        workspace_id: "30000000-0000-4000-8000-000000000003",
        workspace_name: "Northstar",
        project_id: "40000000-0000-4000-8000-000000000004",
        project_name: "Mobile app",
      },
      error: null,
    });

    const result = await createWorkspace({
      name: " Northstar ",
      projectName: " Mobile app ",
    });

    expect(result).toMatchObject({ workspaceName: "Northstar" });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_workspace_with_project",
      {
        workspace_name: "Northstar",
        workspace_logo_path: null,
        project_name: "Mobile app",
      },
    );
  });

  it("redirects successful workspace creation to member onboarding", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        workspace_id: "30000000-0000-4000-8000-000000000003",
        workspace_name: "Northstar",
        project_id: "40000000-0000-4000-8000-000000000004",
        project_name: "Mobile app",
      },
      error: null,
    });

    await expect(
      createWorkspaceFromForm(
        { status: "idle" },
        workspaceFormData("Northstar"),
      ),
    ).rejects.toThrow(
      "redirect:replace:/onboarding/30000000-0000-4000-8000-000000000003/members",
    );
    expect(navigationMocks.redirect).toHaveBeenCalledWith(
      "/onboarding/30000000-0000-4000-8000-000000000003/members",
      "replace",
    );
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(
        /^10000000-0000-4000-8000-000000000001\/[0-9a-f-]+\.png$/,
      ),
      expect.any(Uint8Array),
      {
        contentType: "image/png",
        upsert: false,
      },
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_workspace_with_project",
      {
        workspace_name: "Northstar",
        workspace_logo_path: expect.stringMatching(
          /^10000000-0000-4000-8000-000000000001\/[0-9a-f-]+\.png$/,
        ),
        project_name: "Untitled project",
      },
    );
  });

  it("returns a retryable error for a malformed workspace result", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        workspace_name: "Northstar",
        project_id: "40000000-0000-4000-8000-000000000004",
        project_name: "Mobile app",
      },
      error: null,
    });

    await expect(
      createWorkspaceFromForm(
        { status: "idle" },
        workspaceFormData("Northstar"),
      ),
    ).resolves.toEqual({
      status: "error",
      message:
        "We could not create the workspace. Please try again.",
      retryable: true,
    });
    expect(navigationMocks.redirect).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith([
      expect.stringMatching(
        /^10000000-0000-4000-8000-000000000001\/[0-9a-f-]+\.png$/,
      ),
    ]);
  });

  it("requires a workspace logo", async () => {
    const formData = new FormData();
    formData.set("name", "Northstar");

    await expect(
      createWorkspaceFromForm({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: {
        logo: "Choose a workspace logo.",
      },
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects unsupported workspace logo formats", async () => {
    await expect(
      createWorkspaceFromForm(
        { status: "idle" },
        workspaceFormData(
          "Northstar",
          new File(["logo"], "northstar.svg", {
            type: "image/svg+xml",
          }),
        ),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: {
        logo: "Use a PNG, JPEG, or WebP image.",
      },
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects workspace logos larger than 2 MB", async () => {
    await expect(
      createWorkspaceFromForm(
        { status: "idle" },
        workspaceFormData(
          "Northstar",
          new File(
            [new Uint8Array(2 * 1024 * 1024 + 1)],
            "northstar.png",
            { type: "image/png" },
          ),
        ),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: {
        logo: "Choose an image smaller than 2 MB.",
      },
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("returns a retryable error when the workspace logo upload fails", async () => {
    mocks.upload.mockResolvedValue({
      error: { message: "Upload failed" },
    });

    await expect(
      createWorkspaceFromForm(
        { status: "idle" },
        workspaceFormData("Northstar"),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "We could not upload the logo. Please try again.",
      retryable: true,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("prevents a member from inviting another member", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "Only workspace admins can invite members",
      },
    });

    await expect(
      inviteMember({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        email: "new@example.com",
        productRole: "product_manager",
      }),
    ).rejects.toThrow("Only workspace admins can invite members");
    expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("normalizes email and stores only a SHA-256 hash of the raw token", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "create_invitation"
        ? {
            data: {
              invitation_id:
                "50000000-0000-4000-8000-000000000005",
              workspace_name: "Northstar",
              email: "new@example.com",
              expires_at: "2026-08-01T00:00:00.000Z",
            },
            error: null,
          }
        : { data: null, error: null },
    );
    mocks.sendInvitationEmail.mockResolvedValue({
      providerId: "email_123",
    });

    const result = await inviteMember({
      workspaceId: "30000000-0000-4000-8000-000000000003",
      email: " New@Example.COM ",
      productRole: "product_manager",
    });

    expect(result.deliveryStatus).toBe("sent");
    const rpcInput = mocks.rpc.mock.calls[0][1];
    expect(rpcInput).toEqual({
      invitation_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      inviter_display_name: "Owner Example",
      target_workspace_id:
        "30000000-0000-4000-8000-000000000003",
      invitee_email: "new@example.com",
      invitee_product_role: "product_manager",
      invitation_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const emailInput = mocks.sendInvitationEmail.mock.calls[0][0];
    const token = new URL(emailInput.acceptUrl).pathname.split("/").at(-1);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rpcInput.invitation_token_hash).not.toBe(token);
    expect(JSON.stringify(rpcInput)).not.toContain(token);
    expect(emailInput.to).toBe("new@example.com");
    expect(emailInput.idempotencyKey).toBe(
      "invitation/50000000-0000-4000-8000-000000000005",
    );
  });

  it("retries delivery with the same transient token and does not create another invitation", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "create_invitation"
        ? {
            data: {
              invitation_id:
                "50000000-0000-4000-8000-000000000005",
              workspace_name: "Northstar",
              email: "new@example.com",
              expires_at: "2026-08-01T00:00:00.000Z",
            },
            error: null,
          }
        : { data: null, error: null },
    );
    mocks.sendInvitationEmail
      .mockRejectedValueOnce(new Error("temporary transport failure"))
      .mockResolvedValueOnce({ providerId: "email_123" });

    await expect(
      inviteMember({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        email: "new@example.com",
        productRole: "product_manager",
      }),
    ).resolves.toMatchObject({ deliveryStatus: "sent" });

    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "create_invitation",
      ),
    ).toHaveLength(1);
    expect(mocks.sendInvitationEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendInvitationEmail.mock.calls[0][0].acceptUrl).toBe(
      mocks.sendInvitationEmail.mock.calls[1][0].acceptUrl,
    );
    expect(
      mocks.sendInvitationEmail.mock.calls[0][0].idempotencyKey,
    ).toBe(mocks.sendInvitationEmail.mock.calls[1][0].idempotencyKey);
  });

  it("reconstructs and verifies the same token for an authorized later retry", async () => {
    mocks.rpc.mockImplementation(
      async (name: string, input: Record<string, string>) => {
      if (name === "create_invitation") {
        return {
          data: {
            invitation_id: input.invitation_id,
            workspace_name: "Northstar",
            email: "new@example.com",
            expires_at: "2026-08-01T00:00:00.000Z",
          },
          error: null,
        };
      }
      if (name === "authorize_invitation_delivery") {
        return {
          data: {
            invitation_id: input.invitation_id,
            workspace_name: "Northstar",
            email: "new@example.com",
            token_hash_matches: true,
          },
          error: null,
        };
      }
      return { data: null, error: null };
      },
    );
    mocks.sendInvitationEmail
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({ providerId: "email_123" });

    const created = await inviteMember({
      workspaceId: "30000000-0000-4000-8000-000000000003",
      email: "new@example.com",
      productRole: "product_manager",
    });
    const originalUrl =
      mocks.sendInvitationEmail.mock.calls[0][0].acceptUrl;

    await expect(
      retryInvitationDelivery({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        invitationId: created.invitationId,
      }),
    ).resolves.toMatchObject({ deliveryStatus: "sent" });

    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "create_invitation",
      ),
    ).toHaveLength(1);
    expect(
      mocks.rpc.mock.calls.find(
        ([name]) => name === "authorize_invitation_delivery",
      ),
    ).toEqual([
      "authorize_invitation_delivery",
      {
        target_workspace_id:
          "30000000-0000-4000-8000-000000000003",
        invitation_id: created.invitationId,
        invitation_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    ]);
    expect(mocks.sendInvitationEmail.mock.calls[2][0].acceptUrl).toBe(
      originalUrl,
    );
  });

  it("refuses retry when reconstructed token hash does not match storage", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "Invitation token verification failed",
      },
    });

    await expect(
      retryInvitationDelivery({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        invitationId: "50000000-0000-4000-8000-000000000005",
      }),
    ).rejects.toThrow("Invitation token verification failed");
    expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("keeps a durable invitation retryable when all delivery attempts fail", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "create_invitation"
        ? {
            data: {
              invitation_id:
                "50000000-0000-4000-8000-000000000005",
              workspace_name: "Northstar",
              email: "new@example.com",
              expires_at: "2026-08-01T00:00:00.000Z",
            },
            error: null,
          }
        : { data: null, error: null },
    );
    mocks.sendInvitationEmail.mockRejectedValue(
      new Error("provider unavailable"),
    );

    await expect(
      inviteMember({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        email: "new@example.com",
        productRole: "product_manager",
      }),
    ).resolves.toMatchObject({
      invitationId: "50000000-0000-4000-8000-000000000005",
      deliveryStatus: "failed",
      retryable: true,
    });

    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "create_invitation",
      ),
    ).toHaveLength(1);
    expect(mocks.sendInvitationEmail).toHaveBeenCalledTimes(2);
  });

  it("keeps a crash-equivalent pending invitation retryable", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "authorize_invitation_delivery") {
        return {
          data: {
            invitation_id:
              "50000000-0000-4000-8000-000000000005",
            workspace_name: "Northstar",
            invited_by_name: "Original Owner",
            email: "new@example.com",
            delivery_status: "pending",
            token_hash_matches: true,
          },
          error: null,
        };
      }
      if (name === "mark_invitation_delivery") {
        return { data: "sent", error: null };
      }
      return { data: null, error: null };
    });
    mocks.sendInvitationEmail.mockResolvedValue({
      providerId: "email_pending_recovered",
    });

    await expect(
      retryInvitationDelivery({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        invitationId: "50000000-0000-4000-8000-000000000005",
      }),
    ).resolves.toMatchObject({
      deliveryStatus: "sent",
      retryable: false,
    });
    expect(mocks.sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        invitedByName: "Original Owner",
      }),
    );
  });

  it("surfaces a durable pending retry when sent status persistence fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "create_invitation") {
        return {
          data: {
            invitation_id:
              "50000000-0000-4000-8000-000000000005",
            workspace_name: "Northstar",
            invited_by_name: "Owner Example",
            email: "new@example.com",
            expires_at: "2026-08-01T00:00:00.000Z",
          },
          error: null,
        };
      }
      if (name === "mark_invitation_delivery") {
        return {
          data: null,
          error: { message: "database unavailable" },
        };
      }
      return { data: null, error: null };
    });
    mocks.sendInvitationEmail.mockResolvedValue({
      providerId: "email_123",
    });

    await expect(
      inviteMember({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        email: "new@example.com",
        productRole: "product_manager",
      }),
    ).resolves.toMatchObject({
      deliveryStatus: "pending",
      retryable: true,
      message:
        "The invitation email may have been sent, but delivery status could not be saved. Retry the same invitation.",
    });
    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "mark_invitation_delivery",
      ),
    ).toHaveLength(1);
  });

  it("surfaces a durable pending retry when failed status persistence fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "create_invitation") {
        return {
          data: {
            invitation_id:
              "50000000-0000-4000-8000-000000000005",
            workspace_name: "Northstar",
            invited_by_name: "Owner Example",
            email: "new@example.com",
            expires_at: "2026-08-01T00:00:00.000Z",
          },
          error: null,
        };
      }
      if (name === "mark_invitation_delivery") {
        return {
          data: null,
          error: { message: "database unavailable" },
        };
      }
      return { data: null, error: null };
    });
    mocks.sendInvitationEmail.mockRejectedValue(
      new Error("provider unavailable"),
    );

    await expect(
      inviteMember({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        email: "new@example.com",
        productRole: "product_manager",
      }),
    ).resolves.toMatchObject({
      deliveryStatus: "pending",
      retryable: true,
      message:
        "Email delivery failed and its status could not be saved. Retry the same invitation.",
    });
  });

  it("treats sent as monotonic when a late failed attempt marks delivery", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "create_invitation") {
        return {
          data: {
            invitation_id:
              "50000000-0000-4000-8000-000000000005",
            workspace_name: "Northstar",
            invited_by_name: "Owner Example",
            email: "new@example.com",
            expires_at: "2026-08-01T00:00:00.000Z",
          },
          error: null,
        };
      }
      if (name === "mark_invitation_delivery") {
        return { data: "sent", error: null };
      }
      return { data: null, error: null };
    });
    mocks.sendInvitationEmail.mockRejectedValue(
      new Error("late provider failure"),
    );

    await expect(
      inviteMember({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        email: "new@example.com",
        productRole: "product_manager",
      }),
    ).resolves.toMatchObject({
      deliveryStatus: "sent",
      retryable: false,
    });
  });

  it("uses the original inviter snapshot for a different-admin retry", async () => {
    mocks.rpc.mockImplementation(
      async (name: string, input: Record<string, string>) => {
        if (name === "create_invitation") {
          return {
            data: {
              invitation_id: input.invitation_id,
              workspace_name: "Northstar",
              invited_by_name: "Original Owner",
              email: "new@example.com",
              expires_at: "2026-08-01T00:00:00.000Z",
            },
            error: null,
          };
        }
        if (name === "authorize_invitation_delivery") {
          return {
            data: {
              invitation_id: input.invitation_id,
              workspace_name: "Northstar",
              invited_by_name: "Original Owner",
              email: "new@example.com",
              delivery_status: "failed",
              token_hash_matches: true,
            },
            error: null,
          };
        }
        if (name === "mark_invitation_delivery") {
          return { data: input.delivery_status, error: null };
        }
        return { data: null, error: null };
      },
    );
    mocks.sendInvitationEmail
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({ providerId: "email_123" });

    const created = await inviteMember({
      workspaceId: "30000000-0000-4000-8000-000000000003",
      email: "new@example.com",
      productRole: "product_manager",
    });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "90000000-0000-4000-8000-000000000009",
          email: "other-admin@example.com",
          user_metadata: { full_name: "Different Admin" },
        },
      },
      error: null,
    });

    await retryInvitationDelivery({
      workspaceId: "30000000-0000-4000-8000-000000000003",
      invitationId: created.invitationId,
    });

    expect(mocks.sendInvitationEmail).toHaveBeenCalledTimes(3);
    expect(mocks.sendInvitationEmail.mock.calls[2][0]).toEqual(
      mocks.sendInvitationEmail.mock.calls[0][0],
    );
  });

  it("accepts an invitation through the authenticated matching RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        workspace_id: "30000000-0000-4000-8000-000000000003",
        workspace_name: "Northstar",
      },
      error: null,
    });

    const token = "A".repeat(43);
    const result = await acceptInvitation(token);

    expect(result).toEqual({
      workspaceId: "30000000-0000-4000-8000-000000000003",
      workspaceName: "Northstar",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("accept_invitation", {
      invitation_token: token,
    });
  });
});
