"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentKind } from "@meld/contracts";
import { MeldAgent } from "@/ui/meld-agent";
import { MeldAgentCard } from "@/ui/meld/agent-card";
import { agentCatalogEntry } from "@/features/agents/catalog";
import {
  MeldConsole,
  MeldConsoleCollapse,
  MeldConsoleGroup,
  MeldConsoleResults,
  MeldConsoleRow,
  MeldConsoleSearch,
  MeldConsoleSection,
  MeldConsoleSystem,
  MeldConsoleSystemLink,
  MeldConsoleTeammate,
  MeldConsoleTeammates,
} from "@/ui/meld/console";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { CreateRoomDialog } from "@/features/rooms/components/create-room-dialog";
import { PROJECT_ICON_COMPONENTS } from "@/features/projects/project-icons";
import type { ProjectColor, ProjectIcon } from "@/features/projects/schemas";
import { PixelFile, PixelPlus } from "@/ui/pixel-icons";
import { ROOM_STAGE_PRESENTATION } from "@/features/rooms/stage";
import { useTypewriter } from "@/ui/meld/use-typewriter";
import {
  MeldWorkspaceBar,
  type WorkspaceOption,
} from "@/ui/meld/workspace-bar";

export type ConsoleRoom = {
  id: string;
  name: string;
  /** Display label, e.g. "Discovery". */
  stage: string;
  /** The raw stage, which chooses the icon. */
  stageKey: string;
};

export type ConsoleProject = {
  id: string;
  name: string;
  icon: ProjectIcon;
  color: ProjectColor;
  updatedAt: string | null;
  rooms: ConsoleRoom[];
};

/**
 * A teammate row is nothing but a position in the cast: the name, the sprite
 * and the line about what it does all come from `AGENT_CATALOG`, so the
 * console and the `@`-mention picker cannot describe the same agent
 * differently.
 */
export type ConsoleTeammate = {
  kind: AgentKind;
};

export type WorkspaceConsoleProps = {
  workspaceId: string;
  workspaceName: string;
  workspaceLogoUrl: string | null;
  workspaces: WorkspaceOption[];
  projects: ConsoleProject[];
  teammates: ConsoleTeammate[];
  printedOn: Date;
};

// A room's icon is its stage, taken from the one map the rest of the app
// already uses (`features/rooms/stage.ts`) so the console cannot drift from
// the sidebar or the room header. Unknown stage falls back to a plain file.
function roomIconFor(stage: string) {
  const presentation =
    ROOM_STAGE_PRESENTATION[stage as keyof typeof ROOM_STAGE_PRESENTATION];
  return presentation?.icon ?? PixelFile;
}

// What the field can do, said in its own placeholder rather than in a legend
// beside it.
const PLACEHOLDERS = [
  "Search projects, rooms, people…",
  "Create a project called Checkout…",
  "Ask Meld anything…",
];

export function WorkspaceConsole({
  workspaceId,
  workspaceName,
  workspaceLogoUrl,
  workspaces,
  projects,
  teammates,
  printedOn,
}: WorkspaceConsoleProps) {
  // One project open at a time: the list is long, and two open folders push
  // everything else off the screen.
  const [openProjectId, setOpenProjectId] = useState<string | null>(
    projects[0]?.id ?? null,
  );
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [roomProjectId, setRoomProjectId] = useState<string | null>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  // Which teammate's card is open. Hover and keyboard focus both set it, so
  // the interaction is not mouse-only.
  const [openAgent, setOpenAgent] = useState<AgentKind | null>(null);
  // What the single shared card is currently showing. Held separately from
  // `openAgent` and deliberately sticky: on close, `openAgent` goes null but
  // the card is still on screen animating out, and blanking its contents
  // mid-exit is exactly the flicker this shared card exists to remove.
  const [shownAgent, setShownAgent] = useState<{
    kind: AgentKind;
    index: number;
  }>({ kind: teammates[0]?.kind ?? "design", index: 0 });
  const openIndex = teammates.findIndex(
    (teammate) => teammate.kind === openAgent,
  );
  const shownCard = agentCatalogEntry(shownAgent.kind);

  const placeholder = useTypewriter({
    phrases: PLACEHOLDERS,
    isPaused: isFocused || query.length > 0,
  });

  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();
  const matchingProjects = trimmed
    ? projects.filter((project) =>
        project.name.toLowerCase().includes(needle),
      )
    : [];
  const matchingRooms = trimmed
    ? projects.flatMap((project) =>
        project.rooms
          .filter((room) => room.name.toLowerCase().includes(needle))
          .map((room) => ({ room, project })),
      )
    : [];

  function toggle(projectId: string) {
    setOpenProjectId((current) => (current === projectId ? null : projectId));
  }

  // Send acts on the best match: open the top room if the query found one,
  // otherwise start a room about it. Never a no-op while the field has text.
  function submit() {
    if (!trimmed) return;
    const top = matchingRooms[0];
    if (top) {
      router.push(`/${workspaceId}/rooms/${top.room.id}`);
      return;
    }
    setRoomProjectId(openProjectId ?? projects[0]?.id ?? null);
  }

  return (
    <MeldConsole>
      <MeldConsoleSearch
        id="deck-prompt"
        placeholder={placeholder}
        value={query}
        onValueChange={setQuery}
        onFocusChange={setIsFocused}
        onSubmit={submit}
      >
        {trimmed ? (
          <MeldConsoleResults>
            {matchingRooms.map(({ room, project }) => (
              <MeldConsoleRow
                key={room.id}
                icon={(() => {
                  const RoomIcon = roomIconFor(room.stageKey);
                  return <RoomIcon pack="filled" aria-hidden />;
                })()}
                name={room.name}
                meta={project.name}
                stage={room.stage}
                href={`/${workspaceId}/rooms/${room.id}`}
              />
            ))}
            {matchingProjects.map((project) => {
              const Icon = PROJECT_ICON_COMPONENTS[project.icon];
              return (
                <MeldConsoleRow
                  key={project.id}
                  icon={<Icon pack="filled" aria-hidden />}
                  name={project.name}
                  meta={
                    project.rooms.length === 1
                      ? "1 room"
                      : `${project.rooms.length} rooms`
                  }
                  color={project.color}
                  onToggle={() => {
                    setOpenProjectId(project.id);
                    setQuery("");
                  }}
                />
              );
            })}
            <MeldConsoleRow
              isAction
              name={`+ Create project “${trimmed}”`}
              onToggle={() => setIsCreateProjectOpen(true)}
            />
            <MeldConsoleRow
              isAction
              name={`+ Start a room about “${trimmed}”`}
              onToggle={() =>
                setRoomProjectId(openProjectId ?? projects[0]?.id ?? null)
              }
            />
          </MeldConsoleResults>
        ) : null}
      </MeldConsoleSearch>

      <MeldConsoleSection>PROJECTS</MeldConsoleSection>
      {projects.map((project) => {
        const Icon = PROJECT_ICON_COMPONENTS[project.icon];
        const isOpen = openProjectId === project.id;
        const rooms =
          project.rooms.length === 1
            ? "1 room"
            : `${project.rooms.length} rooms`;

        return (
          <MeldConsoleGroup key={project.id}>
            <MeldConsoleRow
              icon={<Icon pack="filled" aria-hidden />}
              name={project.name}
              meta={rooms}
              color={project.color}
              isExpanded={isOpen}
              onToggle={() => toggle(project.id)}
              rowAction={{
                label: "Create new room",
                icon: <PixelPlus aria-hidden />,
                accessibleLabel: `Create new room in ${project.name}`,
                onClick: () => setRoomProjectId(project.id),
              }}
            />
            <MeldConsoleCollapse isOpen={isOpen}>
                {project.rooms.map((room) => {
                  const RoomIcon = roomIconFor(room.stageKey);
                  return (
                    <MeldConsoleRow
                      key={room.id}
                      depth="child"
                      icon={<RoomIcon pack="filled" aria-hidden />}
                      name={room.name}
                      stage={room.stage}
                      href={`/${workspaceId}/rooms/${room.id}`}
                    />
                  );
                })}
            </MeldConsoleCollapse>
          </MeldConsoleGroup>
        );
      })}

      <MeldConsoleRow
        isAction
        name="+ New project"
        onToggle={() => setIsCreateProjectOpen(true)}
      />

      {teammates.length > 0 ? (
        <>
          <MeldConsoleSection>TEAMMATES</MeldConsoleSection>
          <MeldConsoleTeammates
            card={
              <MeldAgentCard
                kind={shownCard.kind}
                handle={shownCard.handle}
                sprite={shownCard.sprite}
                ability={shownCard.ability}
                abilityText={shownCard.abilityText}
                quote={shownCard.quote}
                isOpen={openAgent !== null}
                offsetIndex={shownAgent.index}
                rowCount={teammates.length}
              />
            }
          >
            {teammates.map((teammate, index) => {
              const agent = agentCatalogEntry(teammate.kind);
              const isOpen = openAgent === teammate.kind;
              // Whichever row is open, the other two turn toward it. Nothing
              // turns when nothing is open, and the open one stands up instead.
              const lean =
                openIndex < 0 || isOpen ? 0 : openIndex > index ? 1 : -1;

              return (
                <MeldConsoleTeammate
                  key={teammate.kind}
                  sprite={
                    <MeldAgent sprite={agent.sprite} appearance="head" />
                  }
                  name={agent.handle}
                  description={agent.description}
                  isOpen={isOpen}
                  isEmphasised={isOpen}
                  lean={lean}
                  onOpenChange={(open) => {
                    if (open) {
                      setShownAgent({ kind: teammate.kind, index });
                      setOpenAgent(teammate.kind);
                      return;
                    }
                    // Clear only if this row is still the open one. Leaving row
                    // A fires after entering row B, and without this guard that
                    // stray close shuts the card the moment it arrives.
                    setOpenAgent((current) =>
                      current === teammate.kind ? null : current,
                    );
                  }}
                />
              );
            })}
          </MeldConsoleTeammates>
        </>
      ) : null}

      <MeldConsoleSystem>
        <MeldConsoleSystemLink href={`/${workspaceId}/settings/members`}>
          SETTINGS
        </MeldConsoleSystemLink>
        <MeldConsoleSystemLink href={`/${workspaceId}/design-system`}>
          DESIGN-SYSTEM
        </MeldConsoleSystemLink>
      </MeldConsoleSystem>

      <CreateProjectDialog
        workspaceId={workspaceId}
        isOpen={isCreateProjectOpen}
        onOpenChange={setIsCreateProjectOpen}
      />
      <CreateRoomDialog
        workspaceId={workspaceId}
        projectId={roomProjectId ?? ""}
        isOpen={roomProjectId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setRoomProjectId(null);
        }}
      />
    </MeldConsole>
  );
}
