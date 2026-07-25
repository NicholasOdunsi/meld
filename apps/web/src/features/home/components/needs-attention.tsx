"use client";

import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { acknowledgeMention } from "../actions";
import type { AttentionItem } from "../attention/types";

export function NeedsAttention({
  items,
}: {
  items: AttentionItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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

  return (
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
              <Timestamp value={item.occurredAt} hasTooltip={false} />
              {item.kind === "mention" ? (
                <Button
                  label="Dismiss"
                  variant="ghost"
                  size="sm"
                  isDisabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      await acknowledgeMention(item.id);
                      router.refresh();
                    });
                  }}
                />
              ) : null}
            </>
          }
        />
      ))}
    </List>
  );
}
