"use client";

import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addDecision,
  addEvidence,
  addRoomParticipant,
} from "../actions";
import { AttachmentUpload } from "./attachment-upload";
import { actionErrorMessage } from "@/ui/action-error";

type Participant = {
  userId: string;
  email: string;
  access: "view" | "edit";
};

type Member = {
  user_id: string;
  email: string;
};

export function RoomInspector({
  roomId,
  currentUserId,
  participants,
  members,
  evidence,
  decisions,
  attachments,
  isAttachmentPersistenceAvailable,
}: {
  roomId: string;
  currentUserId: string;
  participants: Participant[];
  members: Member[];
  evidence: Array<{ id: string; title: string; note?: string | null }>;
  decisions: Array<{ id: string; summary: string }>;
  attachments: Array<{
    id: string;
    originalName: string;
    caption: string | null;
    extractionStatus: string;
    viewUrl: string | null;
  }>;
  isAttachmentPersistenceAvailable: boolean;
}) {
  const router = useRouter();
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [decision, setDecision] = useState("");
  const [error, setError] = useState<string>();
  const canEdit =
    participants.find(
      (participant) => participant.userId === currentUserId,
    )?.access === "edit";
  const participantIds = new Set(
    participants.map((participant) => participant.userId),
  );
  const availableMembers = members.filter(
    (member) => !participantIds.has(member.user_id),
  );

  const run = async (operation: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await operation();
      router.refresh();
    } catch (reason) {
      setError(actionErrorMessage(reason, "The update failed."));
    }
  };

  return (
    <VStack gap={6} padding={4}>
      {error ? <Token label={error} color="red" /> : null}
      <List
        hasDividers
        header={<Heading level={3}>Participants</Heading>}
      >
        {participants.map((participant) => (
          <ListItem
            key={participant.userId}
            label={participant.email}
            description={
              participant.access === "edit" ? "Editor" : "Participant"
            }
            endContent={
              <Token
                label={participant.access}
                color={
                  participant.access === "edit" ? "blue" : "gray"
                }
                size="sm"
              />
            }
          />
        ))}
      </List>
      {canEdit && availableMembers.length > 0 ? (
        <List
          hasDividers
          header={<Heading level={4}>Add workspace members</Heading>}
        >
          {availableMembers.map((member) => (
            <ListItem
              key={member.user_id}
              label={member.email}
              description="Not in this room"
              endContent={
                <Button
                  label={`Add ${member.email}`}
                  size="sm"
                  variant="secondary"
                  clickAction={() =>
                    run(() =>
                      addRoomParticipant({
                        roomId,
                        userId: member.user_id,
                        access: "view",
                      }),
                    )
                  }
                >
                  Add
                </Button>
              }
            />
          ))}
        </List>
      ) : null}
      <VStack gap={3}>
        <List
          hasDividers
          header={<Heading level={3}>Attachments</Heading>}
        >
          {attachments.map((attachment) => (
            <ListItem
              key={attachment.id}
              label={attachment.originalName}
              description={
                attachment.caption ?? attachment.extractionStatus
              }
              href={attachment.viewUrl ?? undefined}
              target={attachment.viewUrl ? "_blank" : undefined}
              rel={attachment.viewUrl ? "noopener noreferrer" : undefined}
              isDisabled={!attachment.viewUrl}
            />
          ))}
        </List>
        <AttachmentUpload
          roomId={roomId}
          isPersistenceAvailable={isAttachmentPersistenceAvailable}
        />
      </VStack>
      <VStack gap={3}>
        <List
          hasDividers
          header={<Heading level={3}>Evidence</Heading>}
        >
          {evidence.map((item) => (
            <ListItem
              key={item.id}
              label={item.title}
              description={item.note ?? "Saved room evidence"}
            />
          ))}
        </List>
        <TextInput
          label="Evidence title"
          value={evidenceTitle}
          onChange={setEvidenceTitle}
        />
        <TextInput
          label="Evidence note"
          value={evidenceNote}
          onChange={setEvidenceNote}
        />
        <Button
          label="Add evidence"
          variant="secondary"
          isDisabled={!evidenceTitle.trim() || !evidenceNote.trim()}
          clickAction={() =>
            run(async () => {
              await addEvidence({
                roomId,
                title: evidenceTitle,
                note: evidenceNote,
              });
              setEvidenceTitle("");
              setEvidenceNote("");
            })
          }
        />
      </VStack>
      <VStack gap={3}>
        <List
          hasDividers
          header={<Heading level={3}>Decisions</Heading>}
        >
          {decisions.map((item) => (
            <ListItem
              key={item.id}
              label={item.summary}
              description="Recorded decision"
            />
          ))}
        </List>
        <TextInput
          label="Decision"
          value={decision}
          onChange={setDecision}
        />
        <Button
          label="Record decision"
          variant="secondary"
          isDisabled={!decision.trim()}
          clickAction={() =>
            run(async () => {
              await addDecision({ roomId, summary: decision });
              setDecision("");
            })
          }
        />
      </VStack>
    </VStack>
  );
}
