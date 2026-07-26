"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acknowledgeMention } from "../actions";
import type { AttentionItem } from "../attention/types";

export function NeedsAttention({
  items,
}: {
  items: AttentionItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Only one row is ever mid-flight per click, so a single id (rather than a
  // set) is enough to disable just that row's Dismiss button.
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <EmptyState
        title="You're all caught up"
        description="Approvals, mentions, and agent results will appear here."
        headingLevel={2}
        isCompact
      />
    );
  }

  function handleDismiss(itemId: string) {
    setError(null);
    setPendingItemId(itemId);
    startTransition(async () => {
      try {
        await acknowledgeMention(itemId);
        router.refresh();
      } catch {
        // Keep the list mounted: a failed dismiss must not fall through to
        // the route's error boundary and take the rest of the home screen
        // with it. Surface the failure inline instead, same shape as
        // UploadDialog's submit failure.
        setError("We could not dismiss that mention. Try again.");
      } finally {
        setPendingItemId(null);
      }
    });
  }

  return (
    <VStack gap={2}>
      {error ? <Banner status="error" title={error} /> : null}
      <List
        hasDividers
        header={<Heading level={2}>Needs attention</Heading>}
      >
        {items.map((item) => (
          <ListItem
            key={item.id}
            label={item.title}
            description={item.roomName}
            href={item.href}
            endContent={
              <>
                <Timestamp value={item.occurredAt} />
                {item.kind === "mention" ? (
                  <Button
                    label="Dismiss"
                    variant="ghost"
                    size="sm"
                    isDisabled={isPending && pendingItemId === item.id}
                    isLoading={isPending && pendingItemId === item.id}
                    onClick={() => handleDismiss(item.id)}
                  />
                ) : null}
              </>
            }
          />
        ))}
      </List>
    </VStack>
  );
}
