"use client";

import {
  Avatar,
  AvatarStatusDot,
} from "@astryxdesign/core/Avatar";
import {
  AvatarGroup,
  AvatarGroupOverflow,
} from "@astryxdesign/core/AvatarGroup";
import { Button } from "@astryxdesign/core/Button";
import {
  Dialog,
  DialogHeader,
} from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { LightBulb } from "@boxicons/react/LightBulb";
import { Robot } from "@boxicons/react/Robot";
import { UserPlus } from "@boxicons/react/UserPlus";
import { useState } from "react";
import {
  AgentMarker,
  DISCOVERY_AGENTS,
  type AgentKind,
} from "./agent-marker";

export type DiscoveryRoomHeaderParticipant = {
  userId: string;
  email: string;
  access: "view" | "edit";
};

type AgentRosterEntry = {
  id: string;
  kind: AgentKind;
  name: string;
  type: "agent";
};

type HumanRosterEntry = DiscoveryRoomHeaderParticipant & {
  id: string;
  name: string;
  type: "human";
};

type RosterEntry = AgentRosterEntry | HumanRosterEntry;

const AGENTS: AgentRosterEntry[] = [
  ...DISCOVERY_AGENTS.map((agent) => ({
    ...agent,
    type: "agent" as const,
  })),
];

const MAX_MODAL_ROOM_LABEL_LENGTH = 24;

function truncateRoomLabel(label: string) {
  if (label.length <= MAX_MODAL_ROOM_LABEL_LENGTH) return label;
  return `${label.slice(0, MAX_MODAL_ROOM_LABEL_LENGTH - 1)}…`;
}

function humanEntry(
  participant: DiscoveryRoomHeaderParticipant,
): HumanRosterEntry {
  return {
    ...participant,
    id: `human:${participant.userId}`,
    name: participant.email,
    type: "human",
  };
}

function RosterAvatar({
  entry,
  isGrouped = false,
  hasStatus = false,
}: {
  entry: RosterEntry;
  isGrouped?: boolean;
  hasStatus?: boolean;
}) {
  if (entry.type === "agent") {
    return (
      <AgentMarker
        kind={entry.kind}
        name={entry.name}
        isGrouped={isGrouped}
      />
    );
  }

  return (
    <Avatar
      name={entry.name}
      size="sm"
      status={
        hasStatus ? (
          <AvatarStatusDot variant="success" label="Active" />
        ) : undefined
      }
      data-testid={`human-avatar-${entry.userId}`}
    />
  );
}

export function DiscoveryRoomHeader({
  roomName,
  currentUserId,
  participants,
}: {
  roomName: string;
  currentUserId: string;
  participants: DiscoveryRoomHeaderParticipant[];
}) {
  const humans = participants.map(humanEntry);
  const currentUser = humans.find(
    (participant) => participant.userId === currentUserId,
  );
  const remainingHumans = humans.filter(
    (participant) => participant.userId !== currentUserId,
  );
  const visibleRoster = [
    ...(currentUser ? [currentUser] : []),
    ...AGENTS,
    ...remainingHumans,
  ].slice(0, 3);
  const fullRoster = [...AGENTS, ...humans];
  const hiddenParticipantCount =
    fullRoster.length - visibleRoster.length;
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const roomLabel = roomName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const modalRoomLabel = truncateRoomLabel(roomLabel);

  return (
    <>
      <HStack
        gap={3}
        hAlign="between"
        vAlign="center"
        width="100%"
        data-testid="discovery-room-header"
      >
        <StackItem size="fill">
          <HStack gap={2} vAlign="center">
            <Icon
              icon={LightBulb}
              size="sm"
              color="secondary"
              data-testid="discovery-room-icon"
            />
            <StackItem size="fill">
              <Heading
                level={3}
                accessibilityLevel={1}
                maxLines={1}
              >
                {roomName}
              </Heading>
            </StackItem>
          </HStack>
        </StackItem>

        <Button
          label={`${fullRoster.length} room participants`}
          variant="ghost"
          size="md"
          onClick={() => setIsParticipantsOpen(true)}
        >
          <AvatarGroup
            size="sm"
            data-testid="visible-room-participants"
          >
            {visibleRoster.map((entry) => (
              <RosterAvatar
                key={entry.id}
                entry={entry}
                isGrouped={entry.type === "agent"}
              />
            ))}
            {hiddenParticipantCount > 0 ? (
              <AvatarGroupOverflow
                count={hiddenParticipantCount}
                data-testid="room-participant-overflow"
              />
            ) : null}
          </AvatarGroup>
        </Button>
      </HStack>

      <Dialog
        isOpen={isParticipantsOpen}
        onOpenChange={setIsParticipantsOpen}
        width="calc(var(--spacing-12) * 9)"
        padding={3}
      >
        <DialogHeader
          title={`Members · ${fullRoster.length}`}
          subtitle={`People and agents in #${modalRoomLabel}`}
          onOpenChange={setIsParticipantsOpen}
        />
        <VStack gap={3} padding={3}>
          <HStack gap={2} width="100%">
            <StackItem size="fill">
              <Button
                label="Invite"
                icon={<Icon icon={UserPlus} size="sm" />}
                variant="secondary"
                size="md"
                width="100%"
                isDisabled
                tooltip="Room invitations are coming soon"
              />
            </StackItem>
            <StackItem size="fill">
              <Button
                label="Add agent"
                icon={<Icon icon={Robot} size="sm" />}
                variant="secondary"
                size="md"
                width="100%"
                isDisabled
                tooltip="Agent setup is planned"
              />
            </StackItem>
          </HStack>

          <List
            density="compact"
            header={
              <Text type="supporting" color="secondary">
                PEOPLE · {humans.length}
              </Text>
            }
          >
            {humans.map((entry) => (
              <ListItem
                key={entry.id}
                label={entry.name}
                startContent={
                  <RosterAvatar entry={entry} hasStatus />
                }
              />
            ))}
          </List>

          <List
            density="compact"
            data-testid="agent-members-list"
            style={{ rowGap: "var(--spacing-2)" }}
            header={
              <Text type="supporting" color="secondary">
                AGENTS · {AGENTS.length}
              </Text>
            }
          >
            {AGENTS.map((entry) => (
              <ListItem
                key={entry.id}
                label={entry.name}
                startContent={<RosterAvatar entry={entry} />}
              />
            ))}
          </List>
        </VStack>
      </Dialog>
    </>
  );
}
