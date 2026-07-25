"use client";

import { Avatar } from "@astryxdesign/core/Avatar";
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
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { LightBulb } from "@boxicons/react/LightBulb";
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
  description: "Agent · UI only";
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
    description: "Agent · UI only",
    type: "agent",
  },
  {
    id: "agent:research",
    kind: "research",
    name: "Research Agent",
    description: "Agent · UI only",
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
}: {
  entry: RosterEntry;
  isGrouped?: boolean;
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
        width="calc(var(--spacing-12) * 6)"
      >
        <DialogHeader
          title="Room participants"
          subtitle={`${fullRoster.length} people in this room`}
          onOpenChange={setIsParticipantsOpen}
        />
        <VStack padding={3}>
          <List density="compact" hasDividers>
            {fullRoster.map((entry) => (
              <ListItem
                key={entry.id}
                label={entry.name}
                description={
                  entry.type === "agent"
                    ? entry.description
                    : entry.access === "edit"
                      ? "Editor"
                      : "Participant"
                }
                startContent={<RosterAvatar entry={entry} />}
                endContent={
                  entry.type === "human" ? (
                    <Token
                      label={entry.access}
                      color={
                        entry.access === "edit" ? "blue" : "gray"
                      }
                      size="sm"
                    />
                  ) : undefined
                }
              />
            ))}
          </List>
        </VStack>
      </Dialog>
    </>
  );
}
