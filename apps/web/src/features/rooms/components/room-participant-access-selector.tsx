"use client";

import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import type { RoomParticipantSelection } from "../schemas";

type ParticipantAccess = RoomParticipantSelection["access"];

const ACCESS_OPTIONS = [
  { value: "view", label: "View only" },
  { value: "edit", label: "Edit" },
] as const;

const ACCESS_SELECTOR_WIDTH = "calc(var(--spacing-12) * 2)";

export function RoomParticipantAccessSelector({
  email,
  value,
  onChange,
}: {
  email: string;
  value: ParticipantAccess;
  onChange: (access: ParticipantAccess) => void;
}) {
  return (
    <HStack onClick={(event) => event.stopPropagation()}>
      <Selector
        label={`Access for ${email}`}
        isLabelHidden
        size="sm"
        width={ACCESS_SELECTOR_WIDTH}
        options={[...ACCESS_OPTIONS]}
        value={value}
        onChange={(access) => {
          if (access === "view" || access === "edit") onChange(access);
        }}
      />
    </HStack>
  );
}

export function reconcileParticipantSelections(
  userIds: string[],
  current: RoomParticipantSelection[],
): RoomParticipantSelection[] {
  const currentByUserId = new Map(
    current.map((participant) => [participant.userId, participant]),
  );
  return userIds.map(
    (userId) =>
      currentByUserId.get(userId) ?? { userId, access: "view" },
  );
}

export function setParticipantSelectionAccess(
  participants: RoomParticipantSelection[],
  userId: string,
  access: ParticipantAccess,
): RoomParticipantSelection[] {
  return participants.map((participant) =>
    participant.userId === userId
      ? { ...participant, access }
      : participant,
  );
}
