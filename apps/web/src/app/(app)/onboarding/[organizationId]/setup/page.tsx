import { requireOrganizationMembership } from "@/features/workspaces/organization-people";
import { WorkspaceSetup } from "@/features/workspaces/workspace-setup";

export default async function WorkspaceSetupPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  await requireOrganizationMembership(
    organizationId,
    `/onboarding/${organizationId}/setup`,
  );

  return <WorkspaceSetup organizationId={organizationId} />;
}
