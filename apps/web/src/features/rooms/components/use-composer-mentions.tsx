"use client";

import { Avatar } from "@astryxdesign/core/Avatar";
import type { ChatComposerTrigger } from "@astryxdesign/core/Chat";
import {
  createStaticSource,
  type SearchableItem,
  TypeaheadItem,
} from "@astryxdesign/core/Typeahead";
import { useMemo } from "react";
import {
  mentionTokenColor,
  type RoomMentionOption,
} from "./composer-model";
import { AgentMarker } from "./agent-marker";

function MentionItem({ item }: { item: SearchableItem }) {
  const option = item.auxiliaryData as RoomMentionOption;
  return (
    <TypeaheadItem
      item={item}
      description={option.description ?? option.handle}
      icon={
        option.kind === "human" ? (
          <Avatar name={option.label} size="sm" />
        ) : (
          <AgentMarker
            kind={option.kind}
            name={option.label}
            size="sm"
          />
        )
      }
    />
  );
}

// Builds the "@" typeahead the composer input consumes. Humans and agents
// share one list; the token colour is what distinguishes them once inserted.
export function useComposerMentions(
  mentions: readonly RoomMentionOption[],
): ChatComposerTrigger {
  const mentionItems = useMemo<
    SearchableItem<RoomMentionOption>[]
  >(
    () =>
      mentions.map((option) => ({
        id: option.id,
        label: option.label,
        auxiliaryData: option,
      })),
    [mentions],
  );

  return useMemo<ChatComposerTrigger>(
    () => ({
      character: "@",
      searchSource: createStaticSource(mentionItems, {
        keywords: (item) => {
          const option =
            item.auxiliaryData as RoomMentionOption;
          return [option.handle, option.description ?? ""];
        },
      }),
      renderItem: (item) => <MentionItem item={item} />,
      onSelect: (item) => {
        const option = item.auxiliaryData as RoomMentionOption;
        return {
          value: `@${option.label}`,
          label: `@${option.label}`,
          variant: mentionTokenColor(option.kind),
        };
      },
      menuLabel: "Mention a teammate or agent",
    }),
    [mentionItems],
  );
}
