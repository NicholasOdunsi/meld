import { MeldDeckFrame } from "@/ui/meld/deck-frame";
import {
  WorkspaceConsole,
  type ConsoleProject,
  type ConsoleTeammate,
} from "./workspace-console";
import {
  MeldWorkspaceBar,
  type WorkspaceOption,
} from "@/ui/meld/workspace-bar";

export type DeckProps = {
  workspaceId: string;
  workspaceName: string;
  workspaceLogoUrl: string | null;
  workspaces: WorkspaceOption[];
  projects: ConsoleProject[];
  teammates: ConsoleTeammate[];
  /** "Now" for age formatting. Injected so tests are stable. */
  printedOn: Date;
};

/**
 * The workspace landing surface: a search line over the workspace as a
 * browsable list, on the soft wash.
 *
 * It renders *without* the sidebar shell, which is why the shell lives in the
 * sub-route layouts rather than at `[workspaceId]/layout.tsx`. The page that
 * mounts this runs `requireWorkspaceAccess` itself.
 */
export function Deck({
  workspaceId,
  workspaceName,
  workspaceLogoUrl,
  workspaces,
  projects,
  teammates,
  printedOn,
}: DeckProps) {
  return (
    <MeldDeckFrame>
      {/* Pinned to the page's top-left corner, outside the console's centred
          column -- it identifies the whole surface, not the list. */}
      <MeldWorkspaceBar
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        logoUrl={workspaceLogoUrl}
        workspaces={workspaces}
      />
      <WorkspaceConsole
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        workspaceLogoUrl={workspaceLogoUrl}
        workspaces={workspaces}
        projects={projects}
        teammates={teammates}
        printedOn={printedOn}
      />
    </MeldDeckFrame>
  );
}
