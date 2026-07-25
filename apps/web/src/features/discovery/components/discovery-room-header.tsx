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
import { Center } from "@astryxdesign/core/Center";
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
import Image from "next/image";
import { useState } from "react";
import mascotFamilyConcept from "../../../../../../docs/superpowers/specs/assets/meld-mascot-family-concept.png";

export type DiscoveryRoomHeaderParticipant = {
  userId: string;
  email: string;
  access: "view" | "edit";
};

type AgentKind = "product" | "research";

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
  {
    id: "agent:product",
    kind: "product",
    name: "Product Agent",
    type: "agent",
  },
  {
    id: "agent:research",
    kind: "research",
    name: "Research Agent",
    type: "agent",
  },
];

function AgentPortrait({
  kind,
  name,
  isGrouped = false,
}: {
  kind: AgentKind;
  name: string;
  isGrouped?: boolean;
}) {
  return (
    <Center
      role="img"
      aria-label={name}
      width="var(--spacing-6)"
      height="var(--spacing-6)"
      data-testid={`${kind}-agent-avatar`}
      style={{
        backgroundColor: "var(--color-background-surface)",
        border: "var(--border-width) solid var(--color-background-surface)",
        borderRadius: "var(--radius-full)",
        marginInlineStart: isGrouped
          ? "calc(var(--spacing-1) * -1)"
          : undefined,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Image
        src={mascotFamilyConcept}
        alt=""
        aria-hidden="true"
        width={1536}
        height={1024}
        style={{
          blockSize: "200%",
          inlineSize: "300%",
          insetBlockStart: 0,
          insetInlineStart: kind === "product" ? "-100%" : "-200%",
          maxInlineSize: "none",
          position: "absolute",
        }}
      />
    </Center>
  );
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
      <AgentPortrait
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

  return (
    <>
      <HStack
        gap={3}
        hAlign="between"
        vAlign="center"
        width="100%"
        data-testid="discovery-room-header"
      >
        <HStack gap={2} vAlign="center">
          <Icon
            icon={LightBulb}
            size="sm"
            color="secondary"
            data-testid="discovery-room-icon"
          />
          <Heading level={3} accessibilityLevel={1}>
            {roomName}
          </Heading>
        </HStack>

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
      >
        <DialogHeader
          title={`Members · ${fullRoster.length}`}
          subtitle={`People and agents in #${roomLabel}`}
          onOpenChange={setIsParticipantsOpen}
        />
        <VStack gap={4} padding={4}>
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
