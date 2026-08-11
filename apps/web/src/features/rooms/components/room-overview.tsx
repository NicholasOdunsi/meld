"use client";

// The stage row renders `getRoomStagePresentation(...).icon`, a React
// component, through the client-only Astryx Icon. A component cannot cross the
// RSC boundary as a prop, so this surface renders on the client -- the same
// place every other reader of the stage presentation lives (room-header,
// room-stage-selector, project-room-navigation).

import { Avatar } from "@astryxdesign/core/Avatar";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import type { RoomOverviewData } from "../overview";
import { getRoomStagePresentation } from "../stage";

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function RoomOverview({
  overview,
}: {
  overview: RoomOverviewData;
}) {
  const stage = getRoomStagePresentation(overview.stage);

  return (
    <Section variant="transparent" padding={0} width="100%">
      <VStack gap={0} width="100%">
        <Section variant="transparent" padding={4} dividers={["bottom"]}>
          <Heading level={3} accessibilityLevel={2}>
            Overview
          </Heading>
        </Section>

        <Section variant="transparent" padding={4} dividers={["bottom"]}>
          <VStack gap={2} width="100%">
            <Heading level={4} accessibilityLevel={3}>
              Participants
            </Heading>
            {overview.participants.length > 0 ? (
              <List
                density="compact"
                hasDividers
                header={<VisuallyHidden>Room participants</VisuallyHidden>}
              >
                {overview.participants.map((participant) => (
                  <ListItem
                    key={participant.userId}
                    label={participant.email}
                    description={
                      participant.access === "edit" ? "Can edit" : "Can view"
                    }
                    startContent={
                      <Avatar name={participant.email} size="sm" />
                    }
                  />
                ))}
              </List>
            ) : (
              <Text color="secondary">No participants available</Text>
            )}
          </VStack>
        </Section>

        <Section variant="transparent" padding={4} dividers={["bottom"]}>
          <VStack gap={2} width="100%">
            <Heading level={4} accessibilityLevel={3}>
              Room status
            </Heading>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Icon icon={stage.icon} size="sm" />
              <Text type="label">{stage.label}</Text>
              <Text type="supporting" color="secondary">
                Latest activity{" "}
                <Timestamp
                  value={overview.latestActivityAt}
                  format="date_time"
                  type="inherit"
                />
              </Text>
            </HStack>
            <Text color="secondary">
              {countLabel(
                overview.participantCount,
                "participant",
                "participants",
              )}
            </Text>
          </VStack>
        </Section>

        <Section variant="transparent" padding={4} dividers={["bottom"]}>
          <List
            density="compact"
            hasDividers
            header={
              <Heading level={4} accessibilityLevel={3}>
                Artifact counts
              </Heading>
            }
          >
            <ListItem
              label="User flows"
              endContent={
                <Text type="supporting" hasTabularNumbers>
                  {overview.counts.userFlows}
                </Text>
              }
            />
            <ListItem
              label="PRDs"
              endContent={
                <Text type="supporting" hasTabularNumbers>
                  {overview.counts.prds}
                </Text>
              }
            />
            <ListItem
              label="Decisions"
              endContent={
                <Text type="supporting" hasTabularNumbers>
                  {overview.counts.decisions}
                </Text>
              }
            />
          </List>
        </Section>

        <Section variant="transparent" padding={4}>
          <VStack gap={2} width="100%">
            <Heading level={4} accessibilityLevel={3}>
              Recent decisions
            </Heading>
            {overview.recentDecisions.length > 0 ? (
              <List
                density="compact"
                hasDividers
                header={<VisuallyHidden>Recent decisions</VisuallyHidden>}
              >
                {overview.recentDecisions.map((decision) => (
                  <ListItem
                    key={decision.id}
                    label={decision.summary}
                    description={
                      <Text type="supporting">
                        {decision.createdByName} ·{" "}
                        <Timestamp
                          value={decision.createdAt}
                          format="date_time"
                          type="inherit"
                        />
                      </Text>
                    }
                  />
                ))}
              </List>
            ) : (
              <Text color="secondary">No decisions recorded yet</Text>
            )}
          </VStack>
        </Section>
      </VStack>
    </Section>
  );
}
