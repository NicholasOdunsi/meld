import { requireWorkspaceMembership } from "@/features/workspaces/workspace-people";
import { WorkspaceSetup } from "@/features/workspaces/workspace-setup";

export default async function WorkspaceSetupPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  await requireWorkspaceMembership(
    workspaceId,
    `/onboarding/${workspaceId}/setup`,
  );

  return <WorkspaceSetup workspaceId={workspaceId} />;
}
