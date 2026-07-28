import "server-only";

import type { WorkspaceBackend } from "./backend";
import {
  fakeAcceptInvitation,
  fakeCreateOrganization,
  fakeInviteMember,
  fakeRetryInvitationDelivery,
  fakeRevokeInvitation,
  getFakeOrganizationContext,
  getFakeUser,
  listFakeOrganizationPeople,
  listFakeUserWorkspaces,
} from "./e2e-fake";

export function createFakeWorkspaceBackend(): WorkspaceBackend {
  return {
    async getCurrentUserId() {
      const user = await getFakeUser();
      return user?.id ?? null;
    },

    async listUserWorkspaces() {
      return listFakeUserWorkspaces();
    },

    async getOrganizationShell(organizationId) {
      const context = await getFakeOrganizationContext(organizationId);
      // The fake store cannot tell "signed out" from "not a member" -- it
      // returns null for both -- so it takes the safer branch and sends
      // the caller to sign-in rather than rendering a 404.
      if (!context) return { status: "unauthenticated" };
      return {
        status: "ok",
        data: {
          currentUserId: context.user.id,
          organizationName: context.organization.name,
        },
      };
    },

    async getOrganizationPeople(organizationId) {
      const people = await listFakeOrganizationPeople(organizationId);
      if (!people) return { status: "unauthenticated" };
      return { status: "ok", data: people };
    },

    async uploadOrganizationLogo(logo) {
      // No object storage behind the fake, so the logo is recorded by name
      // only. Nothing reads the bytes back in this mode.
      return { status: "ok", logoPath: `e2e/${logo.name}` };
    },

    async removeOrganizationLogo() {
      // Nothing was uploaded, so there is nothing to clean up.
    },

    createOrganization(input) {
      return fakeCreateOrganization(input);
    },

    inviteMember(input) {
      return fakeInviteMember(input);
    },

    retryInvitationDelivery(input) {
      return fakeRetryInvitationDelivery(input);
    },

    async revokeInvitation(input) {
      await fakeRevokeInvitation(input);
    },

    acceptInvitation(token) {
      return fakeAcceptInvitation(token);
    },
  };
}
