import type { ReactNode } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { DotsHorizontal } from "@boxicons/react/DotsHorizontal";
import { Edit as EditIcon } from "@boxicons/react/Edit";
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

// Edit, Accept, and an overflow menu (version history / copy / export), plus
// the "Unsaved changes" flag. Rendered as its own full-width bar above the
// (narrower, centered) document body, rather than nested inside it, so it can
// sit flush with the right edge of the page instead of being clamped to the
// body's max width -- and rendered before PrdHeader so it lands as the first
// thing on the page.
//
// While editing, Edit/Accept version morph in place into Cancel/Save changes
// -- same bar, same position -- rather than being replaced by a differently
// laid out editor toolbar; the overflow menu stays put throughout so version
// history / copy / export remain reachable mid-edit.
export function PrdHeaderActions({
  status,
  canEdit,
  canAccept,
  isDirty,
  isEditing,
  isSaving,
  onEdit,
  onCancel,
  onSave,
  onHistory,
  onAccept,
  onCopyDocument,
  onExport,
}: {
  status: RoomPrd["status"];
  canEdit: boolean;
  canAccept: boolean;
  isDirty: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onHistory: () => void;
  onAccept: () => void;
  onCopyDocument: () => void;
  onExport: () => void;
}) {
  return (
    <HStack gap={3} width="100%" vAlign="center" justify="end" wrap="wrap">
      {isDirty ? <Token label="Unsaved changes" color="orange" /> : null}
      {isEditing ? (
        <>
          <Button
            label="Cancel"
            variant="secondary"
            isDisabled={isSaving}
            onClick={onCancel}
          />
          <Button
            label="Save changes"
            variant="primary"
            isDisabled={!canEdit || !isDirty}
            isLoading={isSaving}
            onClick={onSave}
          />
        </>
      ) : (
        <>
          {canEdit ? (
            <Button
              label="Edit"
              variant="ghost"
              icon={<EditIcon pack="basic" size="sm" />}
              onClick={onEdit}
            />
          ) : null}
          {canAccept && status === "draft" ? (
            <Button label="Accept version" variant="primary" onClick={onAccept} />
          ) : null}
        </>
      )}
      <DropdownMenu
        hasChevron={false}
        button={{
          label: "More options",
          tooltip: "More options",
          icon: <DotsHorizontal pack="basic" size="sm" />,
          variant: "ghost",
          isIconOnly: true,
        }}
        items={[
          { label: "Version history", onClick: onHistory },
          { label: "Copy document", onClick: onCopyDocument },
          { label: "Export", onClick: onExport },
        ]}
      />
    </HStack>
  );
}

export function PrdHeader({
  prd,
  ownerName,
  isEditing = false,
  lastAcceptedVersion,
}: {
  prd: RoomPrd;
  ownerName: string;
  isEditing?: boolean;
  lastAcceptedVersion?: number;
}) {
  return (
    <VStack gap={3} width="100%">
      <VStack gap={2}>
        <Property label="Owner">
          <Text>{ownerName}</Text>
        </Property>
        <Property label="Version">
          <Token label={`v${prd.version}`} />
        </Property>
        <Property label="Status">
          <HStack gap={2} wrap="wrap">
            {prd.status === "draft" ? (
              <Token label="Current draft" color="blue" />
            ) : (
              <Badge variant="neutral" label={statusLabel(prd.status)} />
            )}
            {/* Only worth surfacing on a draft, pointing at the different,
                already-accepted version it supersedes. On the accepted
                version itself this would just repeat the Status badge above
                ("Accepted" + "Last accepted vN" naming the same version). */}
            {prd.status === "draft" && lastAcceptedVersion ? (
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
      {/* While editing, PrdEditor renders its own editable title in the same
          visual spot, right after this same metadata block -- showing this
          one too would duplicate it and lag behind the live draft. */}
      {isEditing ? null : <Heading level={1}>{prd.document.title}</Heading>}
    </VStack>
  );
}
