import type { ReactNode } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { RoomPrd } from "../schemas";

// Notion-style property row: a secondary label followed by its value.
function Property({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <HStack gap={3} align="center">
      <Text type="label" color="secondary">
        {label}
      </Text>
      {children}
    </HStack>
  );
}

function statusLabel(status: RoomPrd["status"]) {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function PrdHeader({
  prd,
  ownerName,
  canEdit,
  canAccept,
  canReviewGaps,
  isDirty,
  lastAcceptedVersion,
  onEdit,
  onReviewGaps,
  onHistory,
  onAccept,
}: {
  prd: RoomPrd;
  ownerName: string;
  canEdit: boolean;
  canAccept: boolean;
  canReviewGaps: boolean;
  isDirty: boolean;
  lastAcceptedVersion?: number;
  onEdit: () => void;
  onReviewGaps: () => void;
  onHistory: () => void;
  onAccept: () => void;
}) {
  return (
    <VStack gap={3} width="100%">
      <HStack gap={3} width="100%" vAlign="center" wrap="wrap">
        <Heading level={1}>{prd.document.title}</Heading>
        {isDirty ? <Token label="Unsaved changes" color="orange" /> : null}
        {canEdit ? (
          <Button label="Edit" variant="secondary" onClick={onEdit} />
        ) : null}
        {canReviewGaps ? (
          <Button label="Review gaps" variant="secondary" onClick={onReviewGaps} />
        ) : null}
        <Button label="History" variant="secondary" onClick={onHistory} />
        {canAccept && prd.status === "draft" ? (
          <Button label="Accept version" variant="primary" onClick={onAccept} />
        ) : null}
      </HStack>
      <VStack gap={2}>
        <Property label="Owner">
          <Text>{ownerName}</Text>
        </Property>
        <Property label="Version">
          <Token label={`v${prd.version}`} />
        </Property>
        <Property label="Status">
          <HStack gap={2} wrap="wrap">
            <Badge variant="neutral" label={statusLabel(prd.status)} />
            {prd.status === "draft" ? <Token label="Current draft" color="blue" /> : null}
            {lastAcceptedVersion ? (
              <Token label={`Last accepted v${lastAcceptedVersion}`} color="green" />
            ) : null}
          </HStack>
        </Property>
        <Property label="Created">
          <Text color="secondary">
            {new Date(prd.createdAt).toLocaleString()}
          </Text>
        </Property>
      </VStack>
    </VStack>
  );
}
