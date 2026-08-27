import { DesignSystemView } from "@/features/design/components/design-system-view";
import { resolveComponentBuildRoomId } from "@/features/design/component-build";
import { getWorkspaceDesignSystem } from "@/features/design/workspace-design-profile";
import { getCurrentAgentReadiness } from "@/features/ai/current-agent-readiness";

export default async function DesignSystemPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  // No component_css repair step here any more. A build pass now recompiles
  // that column in the same statement that merges the batch
  // (public.compile_design_component_css, 202608270009), so it is correct for
  // every reader -- room prototypes included -- rather than only for whoever
  // happened to open this page next.
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
