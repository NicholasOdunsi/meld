"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import {
  CheckboxList,
  CheckboxListItem,
} from "@astryxdesign/core/CheckboxList";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  listRoomInviteCandidates,
  createRoomWithParticipants,
} from "@/features/rooms/actions";
import type { RoomInviteCandidate } from "@/features/rooms/backend";
import {
  reconcileParticipantSelections,
  RoomParticipantAccessSelector,
  setParticipantSelectionAccess,
} from "@/features/rooms/components/room-participant-access-selector";
import type { RoomParticipantSelection } from "@/features/rooms/schemas";

export function CreateRoomDialog({
  workspaceId,
  isOpen,
  onOpenChange,
}: {
  workspaceId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<
    RoomParticipantSelection[]
  >([]);
  const selectedUserIds = selectedParticipants.map(
    (participant) => participant.userId,
  );
  // null means "never fetched yet" and drives the loading state; once a
  // fetch has completed once, a reopen refreshes it in the background
  // without flashing back to a spinner over the previously-known list.
  const [candidates, setCandidates] = useState<
    RoomInviteCandidate[] | null
  >(null);
  const isLoadingCandidates = candidates === null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Astryx Dialog hides rather than unmounts on close, so a failed
  // submit would otherwise leave the stale error message, typed name, and
  // selection in place the next time the dialog opens. Reset on the
  // closed-to-open transition, the same wasOpen prop-mirror pattern used
  // by UploadDialog.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setName("");
      setSearch("");
      setSelectedParticipants([]);
      setError(null);
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let cancelled = false;
    listRoomInviteCandidates(workspaceId)
      .then((people) => {
        if (!cancelled) {
          setCandidates(people);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCandidates([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, workspaceId]);

  const query = search.trim().toLowerCase();
  const filteredCandidates = (candidates ?? []).filter((person) =>
    person.email.toLowerCase().includes(query),
  );
  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    try {
      const { roomId } = await createRoomWithParticipants({
        workspaceId,
        name,
        participants: selectedParticipants,
      });
      // Close before navigating. The dialog previously stayed open with its
      // button still spinning for the whole route transition, which read as
      // a hang even though the room already existed. The action already
      // revalidated the workspace layout, so a single push is enough --
      // no follow-up router.refresh() of the entire tree.
      onOpenChange(false);
      router.push(`/${workspaceId}/rooms/${roomId}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not create the room.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width="calc(var(--spacing-12) * 9)"
      padding={3}
    >
      <DialogHeader
        title="Create Room"
        subtitle="Share research, evidence, and decisions."
        onOpenChange={onOpenChange}
        hasDivider
      />
      <VStack gap={4} padding={3}>
        {error ? <Banner status="error" title={error} /> : null}
        <VStack gap={2}>
          <Text type="label">Name</Text>
          <TextInput
            label="Name"
            isLabelHidden
            value={name}
            onChange={setName}
            htmlName="name"
            placeholder="Customer interviews"
          />
        </VStack>
        <VStack gap={2}>
          <Text type="label">Add people (optional)</Text>
          <TextInput
            label="Search people"
            isLabelHidden
            value={search}
            onChange={setSearch}
            placeholder="Search people…"
          />
        </VStack>
        {isLoadingCandidates ? (
          <Spinner size="sm" label="Loading teammates…" />
        ) : (
          <VStack gap={3}>
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
            {filteredCandidates.length === 0 ? (
              <Text type="supporting" color="secondary">
                No other teammates to add yet.
              </Text>
            ) : null}
          </VStack>
        )}
        <Button
          label="Create room"
          variant="primary"
          isDisabled={!name.trim()}
          isLoading={isSubmitting}
          onClick={handleSubmit}
        />
      </VStack>
    </Dialog>
  );
}
