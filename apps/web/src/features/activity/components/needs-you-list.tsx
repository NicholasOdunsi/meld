"use client";

import type { RoomActivity } from "@meld/contracts";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import type { AttentionItem } from "@/features/home/attention/types";
import { NeedsAttention } from "@/features/home/components/needs-attention";
import { PROJECT_COLOR_VARS } from "@/features/projects/project-icons";
import type { ProjectSummary } from "@/features/projects/schemas";
import { ClientTimestamp } from "@/ui/client-timestamp";
import { OrionHatMark } from "@/ui/orion-hat-mark";
import { PixelCheckCircle as CheckCircle } from "@/ui/pixel-icons";
import { dismissProposal, dismissRoomAttention } from "../actions";
import { describeHatLabel, describeNeedsYou } from "../describe";
import { useWorkspaceActivity } from "../workspace-activity-provider";

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

export function NeedsYouList({
  workspaceId,
  projects,
  mentions,
}: {
  workspaceId: string;
  projects: ProjectSummary[];
  mentions: AttentionItem[];
}) {
  const { rooms, refresh } = useWorkspaceActivity();
  const [error, setError] = useState<string | null>(null);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const items = rooms
    .filter((room) => room.state === "needs_you" && projectById.has(room.projectId))
    .sort((a, b) => time(b.occurredAt) - time(a.occurredAt));

  async function dismiss(room: RoomActivity) {
    setError(null);
    try {
      if (room.reason === "asked" && room.proposalMessageId) {
        await dismissProposal(room.proposalMessageId);
      } else {
        await dismissRoomAttention(room.roomId);
      }
      await refresh();
    } catch {
      setError("We could not dismiss that. Try again.");
    }
  }

  return (
    <VStack gap={3}>
      <Heading level={2}>Needs you</Heading>
      {error ? <Banner status="error" title={error} /> : null}
      {items.length === 0 && mentions.length === 0 ? (
        <EmptyState
          icon={<Icon icon={CheckCircle} size="lg" />}
          title="You're all caught up"
          description="Questions, finished work and anything stuck will show up here."
          headingLevel={3}
          isCompact
        />
      ) : (
        <List hasDividers>
          {items.map((room) => {
            const project = projectById.get(room.projectId)!;
            const { title, action } = describeNeedsYou(room);
            const canDismiss =
              room.reason === "asked" || room.reason === "stuck";
            return (
              <ListItem
                key={room.roomId}
                label={title}
                description={`${project.name} › ${room.roomName}`}
                startContent={
                  <OrionHatMark
                    state="needs_you"
                    hop={false}
                    size="md"
                    color={PROJECT_COLOR_VARS[project.color]}
                    label={describeHatLabel(project.name, room, "needs_you")}
                  />
                }
                endContent={
                  <HStack gap={2} vAlign="center">
                    {room.occurredAt ? (
                      <ClientTimestamp value={room.occurredAt} />
                    ) : null}
                    {canDismiss ? (
                      <Button
                        label="Dismiss"
                        variant="ghost"
                        size="sm"
                        onClick={() => dismiss(room)}
                      />
                    ) : null}
                    <Button
                      label={action}
                      variant="primary"
                      size="sm"
                      href={`/${workspaceId}/rooms/${room.roomId}`}
                    />
                  </HStack>
                }
              />
            );
          })}
        </List>
      )}
      {mentions.length > 0 ? <NeedsAttention items={mentions} /> : null}
    </VStack>
  );
}
