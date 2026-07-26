"use client";

import { Button } from "@astryxdesign/core/Button";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { FolderOpen } from "@boxicons/react/FolderOpen";
import { LightBulb } from "@boxicons/react/LightBulb";
import { useState } from "react";
import { CreateRoomDialog } from "./create-room-dialog";
import { UploadDialog } from "./upload-dialog";

type OpenDialog = "none" | "create" | "upload";

export function StartingPoints({
  organizationId,
  isCompact = false,
}: {
  organizationId: string;
  isCompact?: boolean;
}) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>("none");

  return (
    <>
      {isCompact ? (
        <HStack gap={2}>
          <Button
            label="New room"
            variant="primary"
            size="sm"
            onClick={() => setOpenDialog("create")}
          />
          <Button
            label="Upload"
            variant="secondary"
            size="sm"
            onClick={() => setOpenDialog("upload")}
          />
        </HStack>
      ) : (
        <HStack gap={4} width="100%">
          <StackItem size="fill">
            <ClickableCard
              label="Start a Discovery Room"
              padding={5}
              width="100%"
              onClick={() => setOpenDialog("create")}
            >
              <VStack gap={3}>
                <Icon icon={LightBulb} size="md" color="primary" />
                <Text type="label">Start a Discovery Room</Text>
              </VStack>
            </ClickableCard>
          </StackItem>
          <StackItem size="fill">
            <ClickableCard
              label="Upload what you have"
              padding={5}
              width="100%"
              onClick={() => setOpenDialog("upload")}
            >
              <VStack gap={3}>
                <Icon icon={FolderOpen} size="md" color="primary" />
                <Text type="label">Upload what you have</Text>
              </VStack>
            </ClickableCard>
          </StackItem>
        </HStack>
      )}
      <CreateRoomDialog
        organizationId={organizationId}
        isOpen={openDialog === "create"}
        onOpenChange={(isOpen) =>
          setOpenDialog(isOpen ? "create" : "none")
        }
      />
      <UploadDialog
        organizationId={organizationId}
        isOpen={openDialog === "upload"}
        onOpenChange={(isOpen) =>
          setOpenDialog(isOpen ? "upload" : "none")
        }
      />
    </>
  );
}
