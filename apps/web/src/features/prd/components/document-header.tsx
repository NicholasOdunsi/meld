"use client";

import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import {
  PixelDotsHorizontal as DotsHorizontal,
  PixelEdit as EditIcon,
} from "@/ui/pixel-icons";
import { MeldButton } from "@/ui/meld/button";
import { MeldStatusPixel } from "@/ui/meld/status-pixel";
import type { RoomPrd } from "../schemas";

export type DocumentSaveState = "idle" | "saving" | "saved" | "error" | "conflict";

function saveLabel(state: DocumentSaveState): string | null {
  switch (state) {
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "error":
      return "Could not save";
    case "conflict":
      return "Save paused";
    case "idle":
      return null;
  }
}

export function DocumentHeader({
  prd,
  ownerName,
  saveState,
  canEdit,
  canAccept,
  isAccepting,
  onAccept,
  onCopy,
  onExport,
  isEditing,
  onEdit,
}: {
  prd: RoomPrd | null;
  ownerName: string;
  saveState: DocumentSaveState;
  canEdit: boolean;
  canAccept: boolean;
  isAccepting: boolean;
  onAccept: () => void;
  onCopy: () => void;
  onExport: () => void;
  isEditing: boolean;
  onEdit: () => void;
}) {
  const label = saveLabel(saveState);
  return (
    <VStack gap={4} width="100%">
      <HStack width="100%" justify="end" gap={2} wrap="wrap">
        {label ? (
          <Text
            type="label"
            color="secondary"
            role="status"
          >
            {label}
          </Text>
        ) : null}
        {prd && canEdit && !isEditing && prd.status === "accepted" ? (
          <MeldButton
            label="Edit"
            variant="ghost"
            icon={<EditIcon pack="basic" size="sm" />}
            onClick={onEdit}
          />
        ) : null}
        {prd && canAccept && isEditing && prd.status === "draft" ? (
          <MeldButton
            label="Accept version"
            variant="primary"
            size="sm"
            isLoading={isAccepting}
            onClick={onAccept}
          />
        ) : null}
        {prd ? (
          <DropdownMenu
            hasChevron={false}
            button={{
              label: "Document options",
              tooltip: "Document options",
              icon: <DotsHorizontal pack="basic" size="sm" />,
              size: "sm",
              variant: "ghost",
              isIconOnly: true,
            }}
            items={[
              { label: "Copy document", onClick: onCopy },
              { label: "Export", onClick: onExport },
            ]}
          />
        ) : null}
      </HStack>
      <MetadataList
        columns="single"
        label={{ position: "start", width: "calc(var(--spacing-12) * 2)" }}
      >
        <MetadataListItem label="Owner">
          <Text>{ownerName}</Text>
        </MetadataListItem>
        <MetadataListItem label="Version">
          <Token label={`v${prd?.version ?? 1}`} />
        </MetadataListItem>
        <MetadataListItem label="Status">
          {prd?.status === "accepted" ? (
            <MeldStatusPixel tone="success" label="Accepted" />
          ) : (
            <MeldStatusPixel tone="accent" label="Current draft" />
          )}
        </MetadataListItem>
        <MetadataListItem label="Created">
          <Text color="secondary">
            {prd ? new Date(prd.createdAt).toLocaleString() : "Not saved yet"}
          </Text>
        </MetadataListItem>
      </MetadataList>
    </VStack>
  );
}
