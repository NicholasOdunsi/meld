"use server";

import { redirect } from "next/navigation";
import {
  DEFAULT_PROJECT_NAME,
  getWorkspaceBackend,
  WORKSPACE_LOGO_EXTENSIONS,
  WORKSPACE_LOGO_MAX_SIZE,
} from "./backend";
import {
  acceptInvitation,
  inviteMember,
  retryInvitationDelivery,
  revokeInvitation,
} from "./operations";
import {
  InvitationReferenceSchema,
  InviteInputSchema,
  WorkspaceInputSchema,
} from "./schemas";

// Every export below is a publicly callable endpoint, so this module holds
// only the wrappers client components actually submit forms to. The
// operations they delegate to live in ./operations.

export type WorkspaceFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  workspaceId?: string;
  invitationId?: string;
  retryable?: boolean;
  fieldErrors?: {
    name?: string;
    logo?: string;
    email?: string;
    productRole?: string;
  };
};

export async function createWorkspaceFromForm(
  _previousState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const parsedName = WorkspaceInputSchema.shape.name.safeParse(
    formData.get("name"),
  );
  const logo = formData.get("logo");
  const logoError =
    !(logo instanceof File) || logo.size === 0
      ? "Choose a workspace logo."
      : !WORKSPACE_LOGO_EXTENSIONS.has(logo.type)
        ? "Use a PNG, JPEG, or WebP image."
        : logo.size > WORKSPACE_LOGO_MAX_SIZE
          ? "Choose an image smaller than 2 MB."
          : undefined;

  if (!parsedName.success || logoError || !(logo instanceof File)) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: {
        name: parsedName.error?.issues[0]?.message,
        logo: logoError,
      },
    };
  }

  const extension = WORKSPACE_LOGO_EXTENSIONS.get(logo.type);
  if (!extension) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: {
        logo: "Use a PNG, JPEG, or WebP image.",
      },
    };
  }

  const backend = await getWorkspaceBackend();
  const upload = await backend.uploadWorkspaceLogo(logo, extension);

  if (upload.status === "unauthenticated") {
    return {
      status: "error",
      message: "We could not create the workspace. Please try again.",
      retryable: true,
    };
  }
  if (upload.status === "upload-failed") {
    return {
      status: "error",
      message: "We could not upload the logo. Please try again.",
      retryable: true,
    };
  }

  let workspace: Awaited<
    ReturnType<typeof backend.createWorkspace>
  >;

  try {
    workspace = await backend.createWorkspace({
      name: parsedName.data,
      projectName: DEFAULT_PROJECT_NAME,
      logoPath: upload.logoPath,
    });
  } catch {
    await backend.removeWorkspaceLogo(upload.logoPath);
    return {
      status: "error",
      message: "We could not create the workspace. Please try again.",
      retryable: true,
    };
  }

  if (!workspace.workspaceId) {
    await backend.removeWorkspaceLogo(upload.logoPath);
    return {
      status: "error",
      message: "We could not create the workspace. Please try again.",
      retryable: true,
    };
  }

  redirect(
    `/onboarding/${workspace.workspaceId}/members`,
    "replace",
  );
}

export async function inviteMemberFromForm(
  _previousState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const parsed = InviteInputSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    email: formData.get("email"),
    productRole: formData.get("productRole"),
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const hasEmailError = Boolean(fieldErrors.email?.length);
    const hasProductRoleError = Boolean(
      fieldErrors.productRole?.length,
    );

    return {
      status: "error",
      message: hasEmailError
        ? "Enter a valid email address."
        : hasProductRoleError
          ? "Choose a product role."
          : "We could not create the invitation.",
      fieldErrors: {
        email: hasEmailError ? fieldErrors.email?.[0] : undefined,
        productRole: hasProductRoleError
          ? "Choose a role."
          : undefined,
      },
    };
  }

  try {
    const invitation = await inviteMember(parsed.data);
    return {
      status:
        invitation.deliveryStatus === "sent" ? "success" : "error",
      message:
        invitation.deliveryStatus === "sent"
          ? `Invitation sent to ${invitation.email}.`
          : invitation.message,
      workspaceId: parsed.data.workspaceId,
      invitationId: invitation.invitationId,
      retryable: invitation.retryable,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "We could not create the invitation.",
    };
  }
}

export async function retryInvitationDeliveryFromForm(
  _previousState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const parsed = InvitationReferenceSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    invitationId: formData.get("invitationId"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "The invitation reference is invalid.",
    };
  }

  try {
    const result = await retryInvitationDelivery(parsed.data);
    return {
      status: result.deliveryStatus === "sent" ? "success" : "error",
      message:
        result.deliveryStatus === "sent"
          ? `Invitation sent to ${result.email}.`
          : result.message,
      workspaceId: parsed.data.workspaceId,
      invitationId: parsed.data.invitationId,
      retryable: result.retryable,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "We could not retry the invitation.",
    };
  }
}

export async function revokeInvitationFromForm(
  _previousState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const parsed = InvitationReferenceSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    invitationId: formData.get("invitationId"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "The invitation reference is invalid.",
    };
  }

  try {
    await revokeInvitation(parsed.data);
    return {
      status: "success",
      message: "Invitation revoked.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "We could not revoke the invitation.",
    };
  }
}

export async function acceptInvitationFromForm(
  _previousState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const token = formData.get("token");
  if (typeof token !== "string") {
    return {
      status: "error",
      message: "The invitation link is invalid.",
    };
  }

  try {
    const workspace = await acceptInvitation(token);
    return {
      status: "success",
      message: `You joined ${workspace.workspaceName}.`,
      workspaceId: workspace.workspaceId,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "We could not accept the invitation.",
    };
  }
}
