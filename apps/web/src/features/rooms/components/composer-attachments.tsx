import { Carousel } from "@astryxdesign/core/Carousel";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { StagedComposerAttachment } from "./composer-model";

function attachmentStatus(
  attachment: StagedComposerAttachment,
): "Uploading" | "Upload failed" | "Removing" | undefined {
  if (attachment.status === "uploading") {
    return "Uploading";
  }
  if (attachment.status === "failed") {
    return "Upload failed";
  }
  if (attachment.status === "discarding") {
    return "Removing";
  }
  return undefined;
}

function isBusy(attachment: StagedComposerAttachment) {
  return (
    attachment.status === "uploading" ||
    attachment.status === "discarding"
  );
}

function setThumbnailLoading(
  attachment: StagedComposerAttachment,
  element: HTMLElement | null,
) {
  const image = element?.querySelector("img");
  if (!image) {
    return;
  }
  if (isBusy(attachment)) {
    image.setAttribute("data-loading", "true");
  } else {
    image.removeAttribute("data-loading");
  }
}

export function RoomComposerAttachments({
  attachments,
  onRemove,
}: {
  attachments: readonly StagedComposerAttachment[];
  onRemove: (attachmentId: string) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  const images = attachments.filter(({ file }) =>
    file.type.startsWith("image/"),
  );
  const documents = attachments.filter(
    ({ file }) => !file.type.startsWith("image/"),
  );

  return (
    <VStack gap={2} width="100%" aria-live="polite">
      {images.length > 0 ? (
        <Carousel
          aria-label="Image attachments"
          gap={1}
          hasButtons={false}
        >
          {images.map((attachment) => {
            const status = attachmentStatus(attachment);
            return (
              <Thumbnail
                key={attachment.id}
                ref={(element) =>
                  setThumbnailLoading(attachment, element)
                }
                src={attachment.previewUrl}
                alt={attachment.file.name}
                label={
                  status
                    ? `${attachment.file.name}: ${status}`
                    : attachment.file.name
                }
                isLoading={attachment.status === "uploading"}
                isDisabled={isBusy(attachment)}
                onRemove={() => onRemove(attachment.id)}
              />
            );
          })}
        </Carousel>
      ) : null}
      {documents.length > 0 ? (
        <HStack gap={1} wrap="wrap">
          {documents.map((attachment) => {
            const status = attachmentStatus(attachment);
            return (
              <Token
                key={attachment.id}
                label={attachment.file.name}
                aria-label={
                  status
                    ? `${attachment.file.name}: ${status}`
                    : attachment.file.name
                }
                description={
                  attachment.status === "failed"
                    ? attachment.error
                    : status
                }
                color={
                  attachment.status === "failed" ? "red" : "default"
                }
                size="sm"
                isDisabled={isBusy(attachment)}
                endContent={
                  status ? (
                    <Text type="supporting">{status}</Text>
                  ) : undefined
                }
                onRemove={() => onRemove(attachment.id)}
              />
            );
          })}
        </HStack>
      ) : null}
    </VStack>
  );
}
