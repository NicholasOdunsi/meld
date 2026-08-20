import type { ReactNode } from "react";
import { WorkspaceShellLayout } from "@/features/workspaces/workspace-shell-layout";

// The sidebar shell used to live one level up, at `[workspaceId]/layout.tsx`.
// It moved down here because the deck (the workspace landing page) renders
// without a sidebar, and a child route cannot opt out of a parent layout.
// `WorkspaceShellLayout` runs the auth + membership guard itself.
export default async function RoomsLayout({
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
