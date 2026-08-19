import { DesignSystemView } from "@/features/design/components/design-system-view";
import { getWorkspaceDesignSystem } from "@/features/design/workspace-design-profile";

export default async function DesignSystemPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const data = await getWorkspaceDesignSystem(workspaceId);

  return <DesignSystemView data={data} />;
}
