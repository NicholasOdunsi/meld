"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
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
  CheckboxList,
  CheckboxListItem,
} from "@astryxdesign/core/CheckboxList";
import {
  Dialog,
  DialogHeader,
} from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { StackItem } from "@astryxdesign/core/Stack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { RoomStage } from "@meld/contracts";
import { UserPlus } from "@boxicons/react/UserPlus";
import { Trash } from "@boxicons/react/Trash";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  addRoomParticipant,
  listRoomInviteCandidates,
  removeRoomParticipant,
} from "../actions";
import type { RoomInviteCandidate } from "../backend";
import type { RoomParticipantSelection } from "../schemas";
import {
  AgentMarker,
  DISCOVERY_AGENTS,
  type AgentKind,
} from "./agent-marker";
import {
  reconcileParticipantSelections,
  RoomParticipantAccessSelector,
  setParticipantSelectionAccess,
} from "./room-participant-access-selector";
import { RoomStageSelector } from "./room-stage-selector";
import { getRoomStagePresentation } from "../stage";
import { useRoomLifecycleRealtime } from "../use-room-lifecycle-realtime";

export type RoomHeaderParticipant = {
  userId: string;
  email: string;
  access: "view" | "edit";
};

type HumanRosterEntry = RoomHeaderParticipant & {
  id: string;
  name: string;
  type: "human";
};

type AgentRosterEntry = {
  id: string;
  kind: AgentKind;
  name: string;
  type: "agent";
};

type RosterEntry = AgentRosterEntry | HumanRosterEntry;

const AGENTS: AgentRosterEntry[] = DISCOVERY_AGENTS.map((agent) => ({
  ...agent,
  type: "agent" as const,
}));

const MAX_MODAL_ROOM_LABEL_LENGTH = 24;

function truncateRoomLabel(label: string) {
  if (label.length <= MAX_MODAL_ROOM_LABEL_LENGTH) return label;
  return `${label.slice(0, MAX_MODAL_ROOM_LABEL_LENGTH - 1)}…`;
}

function humanEntry(
  participant: RoomHeaderParticipant,
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

export function RoomHeader({
  roomName,
  projectId,
  stage,
  workspaceId,
  roomId,
  ownerId,
  currentUserId,
  participants,
  isCurrentUserWorkspaceAdmin = false,
  realtimeMode = "development-poll",
}: {
  roomName: string;
  projectId: string;
  stage: RoomStage;
  workspaceId: string;
  roomId: string;
  ownerId: string;
  currentUserId: string;
  participants: RoomHeaderParticipant[];
  isCurrentUserWorkspaceAdmin?: boolean;
  realtimeMode?: "development-poll" | "production";
}) {
  const router = useRouter();
  const initialLifecycleRooms = useMemo(
    () => [
      {
        id: roomId,
        workspaceId,
        projectId,
        name: roomName,
        ownerId,
        stage,
      },
    ],
    [ownerId, projectId, roomId, roomName, stage, workspaceId],
  );
  const [lifecycleRoom] = useRoomLifecycleRealtime(
    { roomId },
    initialLifecycleRooms,
    realtimeMode === "production",
  );
  const displayedRoom = lifecycleRoom ?? initialLifecycleRooms[0];
  const stagePresentation = getRoomStagePresentation(displayedRoom.stage);
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
  const [isInviteMode, setIsInviteMode] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<
    RoomParticipantSelection[]
  >([]);
  const selectedUserIds = selectedParticipants.map(
    (participant) => participant.userId,
  );
  const [candidates, setCandidates] = useState<
    RoomInviteCandidate[] | null
  >(null);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeTarget, setRemoveTarget] =
    useState<HumanRosterEntry | null>(null);
  const [error, setError] = useState<string>();
  const participantIds = new Set(
    participants.map((participant) => participant.userId),
  );
  const canManageParticipants = currentUser?.access === "edit";
  const roomLabel = displayedRoom.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const modalRoomLabel = truncateRoomLabel(roomLabel);
  const filteredCandidates = (candidates ?? []).filter((person) => {
    const query = search.trim().toLowerCase();
    return (
      !participantIds.has(person.userId) &&
      person.email.toLowerCase().includes(query)
    );
  });

  useEffect(() => {
    if (!isParticipantsOpen || !isInviteMode) return;
    let cancelled = false;
    listRoomInviteCandidates(workspaceId)
      .then((people) => {
        if (!cancelled) setCandidates(people);
      })
      .catch(() => {
        if (!cancelled) {
          setCandidates([]);
          setError("We could not load workspace members.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCandidates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isInviteMode, isParticipantsOpen, workspaceId]);

  function openInviteMode() {
    setError(undefined);
    setSearch("");
    setSelectedParticipants([]);
    setCandidates(null);
    setIsLoadingCandidates(true);
    setIsInviteMode(true);
  }

  function handleParticipantsOpenChange(isOpen: boolean) {
    setIsParticipantsOpen(isOpen);
    if (!isOpen) {
      setIsInviteMode(false);
      setSearch("");
      setSelectedParticipants([]);
      setCandidates(null);
      setRemoveTarget(null);
      setError(undefined);
    }
  }

  async function handleInvite() {
    setIsSubmitting(true);
    setError(undefined);
    try {
      await Promise.all(
        selectedParticipants.map((participant) =>
          addRoomParticipant({ roomId, ...participant }),
        ),
      );
      setIsInviteMode(false);
      setSearch("");
      setSelectedParticipants([]);
      setCandidates(null);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "We could not invite those people.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveParticipant() {
    if (!removeTarget) return;
    setIsRemoving(true);
    setError(undefined);
    try {
      await removeRoomParticipant({
        roomId,
        userId: removeTarget.userId,
      });
      setRemoveTarget(null);
      router.refresh();
    } catch (reason) {
      setRemoveTarget(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "We could not remove that person from the room.",
      );
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <>
      <HStack
        gap={3}
        hAlign="between"
        vAlign="center"
        width="100%"
        data-testid="room-header"
      >
        <StackItem size="fill">
          <HStack gap={2} vAlign="center">
            <Icon
              icon={stagePresentation.icon}
              size="sm"
              color="secondary"
              data-testid="room-icon"
              aria-label={`${stagePresentation.label} stage`}
            />
            <StackItem size="fill">
              <Heading
                level={3}
                accessibilityLevel={1}
                maxLines={1}
              >
                {displayedRoom.name}
              </Heading>
            </StackItem>
          </HStack>
        </StackItem>

        <HStack gap={2} vAlign="center">
          <RoomStageSelector
            roomId={roomId}
            stage={displayedRoom.stage}
            canChangeStage={
              currentUserId === ownerId || isCurrentUserWorkspaceAdmin
            }
          />
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
      </HStack>

      <Dialog
        isOpen={isParticipantsOpen}
        onOpenChange={handleParticipantsOpenChange}
        width="calc(var(--spacing-12) * 9)"
        padding={3}
      >
        <DialogHeader
          title={`Members · ${fullRoster.length}`}
          subtitle={`People and agents in #${modalRoomLabel}`}
          onOpenChange={handleParticipantsOpenChange}
        />
        {isInviteMode ? (
          <VStack gap={3} padding={3}>
            {error ? <Banner status="error" title={error} /> : null}
            <TextInput
              label="Search people"
              isLabelHidden
              value={search}
              onChange={setSearch}
              placeholder="Search people…"
            />
            {isLoadingCandidates ? (
              <Spinner size="sm" label="Loading teammates…" />
            ) : (
              <CheckboxList
                label={`People · ${filteredCandidates.length}`}
                density="compact"
                value={selectedUserIds}
                onChange={(userIds) =>
                  setSelectedParticipants((current) =>
                    reconcileParticipantSelections(userIds, current),
                  )
                }
              >
                {filteredCandidates.map((person) => {
                  const selection = selectedParticipants.find(
                    (participant) => participant.userId === person.userId,
                  );
                  return (
                    <CheckboxListItem
                      key={person.userId}
                      value={person.userId}
                      label={person.email}
                      endContent={
                        selection ? (
                          <RoomParticipantAccessSelector
                            email={person.email}
                            value={selection.access}
                            onChange={(access) =>
                              setSelectedParticipants((current) =>
                                setParticipantSelectionAccess(
                                  current,
                                  person.userId,
                                  access,
                                ),
                              )
                            }
                          />
                        ) : undefined
                      }
                    />
                  );
                })}
              </CheckboxList>
            )}
            {!isLoadingCandidates && filteredCandidates.length === 0 ? (
              <Text type="supporting" color="secondary">
                No other teammates to invite.
              </Text>
            ) : null}
            <HStack gap={2} width="100%">
              <StackItem size="fill">
                <Button
                  label="Cancel"
                  variant="secondary"
                  width="100%"
                  onClick={() => setIsInviteMode(false)}
                />
              </StackItem>
              <StackItem size="fill">
                <Button
                  label="Invite"
                  variant="primary"
                  width="100%"
                  isDisabled={selectedUserIds.length === 0}
                  isLoading={isSubmitting}
                  onClick={handleInvite}
                />
              </StackItem>
            </HStack>
          </VStack>
        ) : (
          <VStack gap={3} padding={3}>
            {error ? <Banner status="error" title={error} /> : null}
            <Button
              label="Invite"
              icon={<Icon icon={UserPlus} size="sm" />}
              variant="secondary"
              width="100%"
              onClick={openInviteMode}
            />
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
                  description={
                    entry.userId === ownerId
                      ? "Owner"
                      : entry.access === "edit"
                        ? "Can edit"
                        : "View only"
                  }
                  startContent={<RosterAvatar entry={entry} hasStatus />}
                  endContent={
                    canManageParticipants &&
                    entry.userId !== ownerId &&
                    entry.userId !== currentUserId ? (
                      <IconButton
                        label={`Remove ${entry.name} from room`}
                        icon={<Icon icon={Trash} size="sm" />}
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveTarget(entry)}
                      />
                    ) : undefined
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
        )}
      </Dialog>
      <AlertDialog
        isOpen={removeTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isRemoving) setRemoveTarget(null);
        }}
        title="Remove user from room?"
        description={`${removeTarget?.name ?? "This user"} will lose access to this room and its contents.`}
        actionLabel="Remove user"
        isActionLoading={isRemoving}
        onAction={handleRemoveParticipant}
        width="calc(var(--spacing-12) * 8)"
      />
    </>
  );
}
