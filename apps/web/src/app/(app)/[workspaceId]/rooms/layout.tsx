import { AppShell } from "@astryxdesign/core/AppShell";
import type { ReactNode } from "react";
import { requireWorkspaceAccess } from "@/features/workspaces/require-workspace-access";

// Rooms use the same full-bleed, sidebar-free shell as the workspace deck.
// Keep the shared access guard here because there is no parent workspace
// layout around this route anymore.
export default async function RoomsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  await requireWorkspaceAccess(workspaceId);
  return (
    <AppShell height="fill" variant="surface" contentPadding={0}>
      {children}
    </AppShell>
  );
}
