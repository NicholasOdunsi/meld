"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef } from "react";
import type { DesignReferenceView } from "@meld/contracts";
import {
  refreshDesignReference,
  removeDesignReference,
} from "@/features/design/design-references-actions";

// A cached thumbnail older than this is worth a background re-fetch -- the
// Figma file's title or preview may have moved on since we last looked.
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

// Mirrors message-attachments.tsx's own local helper: open a resolved URL in
// a new tab without ever handing the opened window a reference back.
function openInNewTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

// The link card's visible label. Falls back to the raw URL for anything the
// URL constructor rejects (should be unreachable -- normalizedUrl is always
// produced by normalizeFigmaUrl -- but never worth a blank card over it).
function hostLabel(normalizedUrl: string): string {
  try {
    return new URL(normalizedUrl).hostname;
  } catch {
    return normalizedUrl;
  }
}

// Whether this reference is worth a background refresh: still unresolved, or
// resolved so long ago its cached thumbnail/title may be stale. A missing or
// unparsable fetchedAt on an "ok" row is treated as stale rather than fresh --
// never silently skipping a refresh it can't actually rule out.
function isRefreshWorthy(reference: DesignReferenceView): boolean {
  if (reference.oembedStatus === "pending") return true;
  if (reference.oembedStatus !== "ok") return false;
  if (!reference.fetchedAt) return true;
  const fetchedAtMs = new Date(reference.fetchedAt).getTime();
  if (Number.isNaN(fetchedAtMs)) return true;
  return Date.now() - fetchedAtMs > STALE_THRESHOLD_MS;
}

// A single Figma reference, rendered by its oEmbed lifecycle: `pending`/
// `failed` show a plain link card (host + an "Open in Figma" affordance);
// `ok` shows the cached thumbnail and title. An editor viewing a `pending`
// row, or an `ok` row whose cache has gone stale, triggers exactly one
// background refresh (never a viewer, never more than once per mount) and
// reports the upgraded view upward so the conversation can replace this
// reference in place.
export function FigmaReferenceCard({
  reference,
  canEdit,
  onRemoved,
  onRefreshed,
  refresh = refreshDesignReference,
  remove = removeDesignReference,
}: {
  reference: DesignReferenceView;
  canEdit: boolean;
  onRemoved?: (id: string) => void;
  onRefreshed?: (reference: DesignReferenceView) => void;
  refresh?: typeof refreshDesignReference;
  remove?: typeof removeDesignReference;
}) {
  // One-shot guard: a parent re-render (new reference identity, unrelated
  // state change) must never re-fire the refresh. Only remount does.
  const hasRequestedRefreshRef = useRef(false);

  useEffect(() => {
    if (!canEdit || hasRequestedRefreshRef.current) return;
    if (!isRefreshWorthy(reference)) return;
    hasRequestedRefreshRef.current = true;
    let active = true;
    void (async () => {
      const upgraded = await refresh(reference.id);
      if (active && upgraded) onRefreshed?.(upgraded);
    })();
    return () => {
      active = false;
    };
    // Deliberately keyed only by identity + the one-shot guard: re-running
    // this effect on every `reference` update (e.g. after the refresh it
    // triggers upgrades the prop) would defeat the guard entirely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, reference.id]);

  const handleRemove = async () => {
    const result = await remove(reference.id);
    if (result.status === "removed") onRemoved?.(reference.id);
  };

  const removeAffordance = canEdit ? (
    <Button
      label="Remove Figma reference"
      variant="ghost"
      size="sm"
      data-testid="figma-card-remove"
      clickAction={handleRemove}
    >
      Remove
    </Button>
  ) : null;

  if (reference.oembedStatus === "ok") {
    return (
      <Card variant="default" padding={2} data-testid="figma-card-ok">
        <HStack gap={2} vAlign="center" justify="between" width="100%">
          <HStack gap={2} vAlign="center">
            <Thumbnail
              src={reference.thumbnailUrl ?? undefined}
              alt={reference.title ?? hostLabel(reference.normalizedUrl)}
              onClick={() => openInNewTab(reference.normalizedUrl)}
            />
            <Text type="label">
              {reference.title ?? hostLabel(reference.normalizedUrl)}
            </Text>
          </HStack>
          {removeAffordance}
        </HStack>
      </Card>
    );
  }

  return (
    <Card
      variant="default"
      padding={2}
      data-testid={
        reference.oembedStatus === "pending"
          ? "figma-card-pending"
          : "figma-card-failed"
      }
    >
      <HStack gap={2} vAlign="center" justify="between" width="100%">
        <VStack gap={0.5}>
          <Text type="label">{hostLabel(reference.normalizedUrl)}</Text>
          <Token
            label="Open in Figma"
            size="sm"
            onClick={() => openInNewTab(reference.normalizedUrl)}
          />
        </VStack>
        {removeAffordance}
      </HStack>
    </Card>
  );
}
