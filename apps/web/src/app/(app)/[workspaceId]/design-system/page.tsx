import { DesignSystemView } from "@/features/design/components/design-system-view";
import {
  recompileComponentCssIfPassCompleted,
  resolveComponentBuildRoomId,
} from "@/features/design/component-build";
import { getWorkspaceDesignSystem } from "@/features/design/workspace-design-profile";

export default async function DesignSystemPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  // Best-effort: a build pass copies component_css forward unchanged as it
  // merges (202608270002), so it is stale the instant a component is built.
  // Recompiling before reading the page's own data is what keeps the
  // component previews below in sync with the profile that just landed.
  await recompileComponentCssIfPassCompleted(workspaceId);

  const [data, roomId] = await Promise.all([
    getWorkspaceDesignSystem(workspaceId),
    resolveComponentBuildRoomId(workspaceId),
  ]);

  return <DesignSystemView data={data} roomId={roomId} />;
}
