"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { InspirationItemView } from "@meld/contracts";

const FALLBACK_LABEL = "Inspiration image";

export function InspirationTile({
  item,
  isSelected,
  onSelectedChange,
  onOpen,
  hideSelection = false,
}: {
  item: InspirationItemView;
  isSelected: boolean;
  onSelectedChange: (itemId: string, isSelected: boolean) => void;
  onOpen: (itemId: string) => void;
  hideSelection?: boolean;
}) {
  const label = item.note ?? FALLBACK_LABEL;
  return (
    <VStack gap={1} data-testid="inspiration-tile">
      {/*
        ClickableCard's accessible control is a 1×1 clipped button under the
        image, so Playwright (and anything that targets the named button) can't
        land a real click. A full-size <button> wrapping the image keeps the
        same "Open …" name while matching the hit target — same pattern as
        agents-transcript thumbnails.
      */}
      <Card padding={0}>
        <button
          type="button"
          aria-label={`Open ${label}`}
          onClick={() => onOpen(item.id)}
          style={{
            all: "unset",
            display: "block",
            width: "100%",
            cursor: "pointer",
          }}
        >
          <AspectRatio ratio={1} fit="cover">
            {item.imageUrl ? (
              // Signed storage URLs (or data: URLs in the E2E fake): next/image
              // can't optimise either without a remote-pattern allowlist.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt={label}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <Skeleton width="100%" height="100%" />
            )}
          </AspectRatio>
        </button>
      </Card>
      <HStack gap={2} align="center">
        {hideSelection ? null : (
          <CheckboxInput
            label="Select image"
            isLabelHidden
            size="sm"
            value={isSelected}
            onChange={(checked) => onSelectedChange(item.id, checked)}
          />
        )}
        {item.note ? (
          <Text type="supporting" maxLines={1}>
            {item.note}
          </Text>
        ) : null}
      </HStack>
    </VStack>
  );
}
