import { DesignSystemView } from "@/features/design/components/design-system-view";
import {
  recompileComponentCssIfStale,
  resolveComponentBuildRoomId,
} from "@/features/design/component-build";
import { getWorkspaceDesignSystem } from "@/features/design/workspace-design-profile";
import { getCurrentAgentReadiness } from "@/features/ai/current-agent-readiness";

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
  // recompileComponentCssIfStale itself skips both the comparison work and
  // the write for a workspace with no active version, so this costs nothing
  // extra for a workspace with no design system yet.
  await recompileComponentCssIfStale(workspaceId);

  const [data, roomId, readiness] = await Promise.all([
    getWorkspaceDesignSystem(workspaceId),
    resolveComponentBuildRoomId(workspaceId),
    getCurrentAgentReadiness(),
  ]);

  // The button must queue a pass against a provider the caller's own device
  // can actually run (see 202608270005_start_component_build_resolves_provider.sql
  // -- the RPC now resolves this itself from ai_user_preferences regardless
  // of what is passed here, but the UI should not offer a choice it already
  // knows is fictional). No ready provider means no runnable device either,
  // so the button simply does not render.
  const provider = readiness.ready ? readiness.defaultProvider : null;

  return <DesignSystemView data={data} roomId={roomId} provider={provider} />;
}
