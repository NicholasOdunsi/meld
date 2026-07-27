"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import {
  CheckboxList,
  CheckboxListItem,
} from "@astryxdesign/core/CheckboxList";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { List, ListItem } from "@astryxdesign/core/List";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  listRoomInviteCandidates,
  createRoomWithParticipants,
  type RoomInviteCandidate,
} from "@/features/discovery/actions";
import {
  AgentMarker,
  DISCOVERY_AGENTS,
} from "@/features/discovery/components/agent-marker";

export function CreateRoomDialog({
  organizationId,
  isOpen,
  onOpenChange,
}: {
  organizationId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
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
      setSelectedUserIds([]);
      setError(null);
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let cancelled = false;
    listRoomInviteCandidates(organizationId)
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
  }, [isOpen, organizationId]);

  const query = search.trim().toLowerCase();
  const filteredCandidates = (candidates ?? []).filter((person) =>
    person.email.toLowerCase().includes(query),
  );
  const filteredAgents = DISCOVERY_AGENTS.filter((agent) =>
    agent.name.toLowerCase().includes(query),
  );

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    try {
      const { roomId } = await createRoomWithParticipants({
        organizationId,
        name,
        participantUserIds: selectedUserIds,
      });
      // Close before navigating. The dialog previously stayed open with its
      // button still spinning for the whole route transition, which read as
      // a hang even though the room already existed. The action already
      // revalidated the organization layout, so a single push is enough --
      // no follow-up router.refresh() of the entire tree.
      onOpenChange(false);
      router.push(`/${organizationId}/discovery/${roomId}`);
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
        title="Create Discovery Room"
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
            label="Search people and agents"
            isLabelHidden
            value={search}
            onChange={setSearch}
            placeholder="Search people and agents…"
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
              onChange={setSelectedUserIds}
            >
              {filteredCandidates.map((person) => (
                <CheckboxListItem
                  key={person.userId}
                  value={person.userId}
                  label={person.email}
                />
              ))}
            </CheckboxList>
            {filteredCandidates.length === 0 ? (
              <Text type="supporting" color="secondary">
                No other teammates to add yet.
              </Text>
            ) : null}
            <List
              density="compact"
              header={
                <Text type="supporting" color="secondary">
                  Agents · {filteredAgents.length}
                </Text>
              }
            >
              {filteredAgents.map((agent) => (
                <ListItem
                  key={agent.id}
                  label={agent.name}
                  startContent={
                    <AgentMarker kind={agent.kind} name={agent.name} />
                  }
                />
              ))}
            </List>
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
