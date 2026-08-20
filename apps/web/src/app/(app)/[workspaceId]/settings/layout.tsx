import type { ReactNode } from "react";
import { WorkspaceShellLayout } from "@/features/workspaces/workspace-shell-layout";

// See `rooms/layout.tsx`: the shell moved down from `[workspaceId]/` so the
// deck can render without it. `WorkspaceShellLayout` carries the auth +
// membership guard, so mounting it is what keeps this subtree gated.
export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <WorkspaceShellLayout workspaceId={workspaceId}>
      {children}
    </WorkspaceShellLayout>
  );
}
