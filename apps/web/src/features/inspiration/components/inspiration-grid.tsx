"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Grid } from "@astryxdesign/core/Grid";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import type { InspirationItemView } from "@meld/contracts";
import { InspirationTile } from "./inspiration-tile";

const TILE_MIN_WIDTH = 200;

export function InspirationGrid({
  items,
  selectedIds,
  onSelectedChange,
  onOpen,
  uploadingCount = 0,
  hideSelection = false,
}: {
  items: InspirationItemView[];
  selectedIds: ReadonlySet<string>;
  onSelectedChange: (itemId: string, isSelected: boolean) => void;
  onOpen: (itemId: string) => void;
  uploadingCount?: number;
  hideSelection?: boolean;
}) {
  return (
    <Grid gap={4} columns={{ minWidth: TILE_MIN_WIDTH, repeat: "fill" }} data-testid="inspiration-grid">
      {Array.from({ length: uploadingCount }, (_, index) => (
        <AspectRatio key={`uploading-${index}`} ratio={1} data-testid="inspiration-uploading">
          <Skeleton width="100%" height="100%" />
        </AspectRatio>
      ))}
      {items.map((item) => (
        <InspirationTile
          key={item.id}
          item={item}
          isSelected={selectedIds.has(item.id)}
          onSelectedChange={onSelectedChange}
          onOpen={onOpen}
          hideSelection={hideSelection}
        />
      ))}
    </Grid>
  );
}
