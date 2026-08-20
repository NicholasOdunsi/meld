import Link from "next/link";
import type { RoomParticipantView } from "../backend";
import type {
  RoomDecision,
  RoomOverviewData,
  RoomOverviewParticipant,
} from "../overview";
import { sortRoomDecisions } from "../overview";
import type { PaneTool } from "../pane-layout";
import { MeldAvatar } from "@/ui/meld/avatar";
import { MeldBadge } from "@/ui/meld/badge";
import { MeldColumnHeading } from "@/ui/meld/column-heading";
import { MeldList, MeldListItem } from "@/ui/meld/list";
import { MeldRegion } from "@/ui/meld/region";
import { MeldStatusPixel } from "@/ui/meld/status-pixel";
import {
  MeldNote,
  MeldSection,
  MeldStack,
  MeldSupportingText,
} from "@/ui/meld/stack";

export type RoomOverviewArtifact = {
  tool: PaneTool;
  label: string;
};

export type RoomOverviewTabProps = {
  overview: RoomOverviewData | null;
  decisions: readonly RoomDecision[];
  participants: RoomParticipantView[];
  artifacts: RoomOverviewArtifact[];
  basePath: string;
};

type OverviewParticipant = RoomOverviewParticipant & {
  isLive?: boolean;
  online?: boolean;
  name?: string;
  displayName?: string;
};

type OverviewRecord = Record<string, unknown>;

function asRecord(value: unknown): OverviewRecord | null {
  return typeof value === "object" && value !== null
    ? (value as OverviewRecord)
    : null;
}

function textFrom(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ["body", "text", "content", "message"]) {
    const text = record[key];
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  return null;
}

function overviewText(overview: RoomOverviewData | null): string | null {
  const record = asRecord(overview);
  if (!record) return null;

  for (const key of ["prdSummary", "summary"]) {
    const text = textFrom(record[key]);
    if (text) return text;
  }

  const prd = asRecord(record.prd);
  const document = asRecord(prd?.document ?? record.prdDocument);
  return textFrom(document?.executiveSummary);
}

function openingMessage(overview: RoomOverviewData | null): string | null {
  const record = asRecord(overview);
  return record ? textFrom(record.openingMessage ?? record.opening) : null;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function stageLabel(stage: RoomOverviewData["stage"]): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

function artifactCount(
  overview: RoomOverviewData | null,
  tool: PaneTool,
): number | null {
  if (!overview) return null;
  if (tool === "canvas") return overview.counts.userFlows;
  if (tool === "prd") return overview.counts.prds;
  return null;
}

function participantLabel(participant: OverviewParticipant): string {
  return participant.displayName ?? participant.name ?? participant.email;
}

function participantIsLive(participant: OverviewParticipant): boolean {
  return participant.isLive === true || participant.online === true;
}

function decisionHref(basePath: string, decision: RoomDecision): string | undefined {
  return decision.sourceMessageId
    ? `${basePath}?tab=conversation&message=${decision.sourceMessageId}`
    : undefined;
}

export function RoomOverviewTab({
  overview,
  decisions,
  participants,
  artifacts,
  basePath,
}: RoomOverviewTabProps) {
  const summary = overviewText(overview);
  const opening = openingMessage(overview);
  const roomDescription =
    summary ??
    opening ??
    "No summary or opening message yet. Start the conversation to define this Room.";
  const chronologicalDecisions = sortRoomDecisions(decisions);
  const recentDecisions = overview?.recentDecisions ?? [];

  return (
    <MeldRegion data-testid="room-overview-tab">
      <MeldStack gap={6}>
        <MeldSection title="What this Room is">
          <MeldStack gap={2}>
            <MeldSupportingText>{roomDescription}</MeldSupportingText>
            {overview ? (
              <MeldNote>
                {stageLabel(overview.stage)} · Latest activity {formatDate(overview.latestActivityAt)}
              </MeldNote>
            ) : null}
          </MeldStack>
        </MeldSection>

        <MeldSection title="Decisions">
          <MeldColumnHeading
            label="DECISIONS"
            count={chronologicalDecisions.length}
          />
          {chronologicalDecisions.length > 0 ? (
            <MeldList>
              {chronologicalDecisions.map((decision) => {
                const href = decisionHref(basePath, decision);
                return (
                  <MeldListItem
                    key={decision.id}
                    label={decision.summary}
                    end={
                      <MeldStack gap={2}>
                        <MeldSupportingText>
                          {decision.createdByName} · {formatDate(decision.createdAt)}
                        </MeldSupportingText>
                        {href ? <Link href={href}>View message</Link> : null}
                      </MeldStack>
                    }
                  />
                );
              })}
            </MeldList>
          ) : (
            <MeldNote>No decisions recorded yet.</MeldNote>
          )}
        </MeldSection>

        <MeldSection title="Artifacts">
          <MeldColumnHeading label="ARTIFACTS" count={artifacts.length} />
          {artifacts.length > 0 ? (
            <MeldList>
              {artifacts.map((artifact) => {
                const count = artifactCount(overview, artifact.tool);
                return (
                  <MeldListItem
                    key={artifact.tool}
                    label={artifact.label}
                    end={
                      <MeldStack gap={2}>
                        {count !== null ? (
                          <MeldBadge
                            label={`${count}`}
                            tone="neutral"
                          />
                        ) : null}
                        <Link href={`${basePath}?tab=${artifact.tool}`}>
                          Open {artifact.label}
                        </Link>
                      </MeldStack>
                    }
                  />
                );
              })}
            </MeldList>
          ) : (
            <MeldNote>No artifacts recorded yet.</MeldNote>
          )}
        </MeldSection>

        <MeldSection title="People">
          <MeldColumnHeading label="PEOPLE" count={participants.length} />
          {participants.length > 0 ? (
            <MeldList>
              {participants.map((participant) => {
                const person = participant as OverviewParticipant;
                const live = participantIsLive(person);
                return (
                  <MeldListItem
                    key={participant.userId}
                    label={participantLabel(person)}
                    start={<MeldAvatar name={participant.email} />}
                    end={
                      <MeldStack gap={2}>
                        <MeldBadge
                          label={participant.access === "edit" ? "Can edit" : "Can view"}
                          tone={participant.access === "edit" ? "green" : "neutral"}
                        />
                        {live ? (
                          <MeldStatusPixel tone="success" label="Live" />
                        ) : null}
                      </MeldStack>
                    }
                  />
                );
              })}
            </MeldList>
          ) : (
            <MeldNote>No participants available.</MeldNote>
          )}
        </MeldSection>

        <MeldSection title="Recent">
          <MeldColumnHeading
            label="RECENT DECISIONS"
            count={recentDecisions.length}
          />
          {recentDecisions.length > 0 ? (
            <MeldList>
              {recentDecisions.map((decision) => (
                <MeldListItem
                  key={decision.id}
                  label={decision.summary}
                  end={
                    <MeldSupportingText>
                      {decision.createdByName} · {formatDate(decision.createdAt)}
                    </MeldSupportingText>
                  }
                />
              ))}
            </MeldList>
          ) : (
            <MeldNote>No recent activity yet.</MeldNote>
          )}
        </MeldSection>
      </MeldStack>
    </MeldRegion>
  );
}
