import { Carousel } from "@astryxdesign/core/Carousel";
import { HStack } from "@astryxdesign/core/HStack";
import { Token } from "@astryxdesign/core/Token";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { VStack } from "@astryxdesign/core/VStack";
import type { DiscoveryAttachmentView } from "../attachment-types";

// The read-only counterpart to DiscoveryComposerAttachments: it renders the
// files that were linked to a persisted message. Images become thumbnails
// (opening the signed viewUrl in a new tab), documents become download tokens.
// A missing viewUrl (e.g. a signing failure) simply renders without a target
// rather than breaking the message.
function openInNewTab(url: string | null) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function MessageAttachments({
  attachments,
}: {
  attachments: DiscoveryAttachmentView[];
}) {
  if (attachments.length === 0) {
    return null;
  }

  const images = attachments.filter((attachment) =>
    attachment.mimeType.startsWith("image/"),
  );
  const documents = attachments.filter(
    (attachment) => !attachment.mimeType.startsWith("image/"),
  );

  return (
    <VStack gap={2} width="100%" data-testid="message-attachments">
      {images.length > 0 ? (
        <Carousel
          aria-label="Image attachments"
          gap={1}
          hasButtons={false}
        >
          {images.map((attachment) => (
            <Thumbnail
              key={attachment.id}
              src={attachment.viewUrl ?? undefined}
              alt={attachment.caption ?? attachment.originalName}
              label={attachment.originalName}
              onClick={
                attachment.viewUrl
                  ? () => openInNewTab(attachment.viewUrl)
                  : undefined
              }
            />
          ))}
        </Carousel>
      ) : null}
      {documents.length > 0 ? (
        <HStack gap={1} wrap="wrap">
          {documents.map((attachment) => (
            <Token
              key={attachment.id}
              label={attachment.originalName}
              aria-label={attachment.originalName}
              size="sm"
              onClick={
                attachment.viewUrl
                  ? () => openInNewTab(attachment.viewUrl)
                  : undefined
              }
            />
          ))}
        </HStack>
      ) : null}
    </VStack>
  );
}
