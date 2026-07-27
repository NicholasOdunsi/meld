import { Badge } from "@astryxdesign/core/Badge";
import type { MarkdownInlinePlugin } from "@astryxdesign/core/Markdown";
import {
  buildSerializedMentionLookup,
  hasMentionPrefixBoundary,
  hasMentionSuffixBoundary,
  mentionTokenColor,
  type DiscoveryMentionOption,
} from "./composer-model";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildMentionInlinePlugins(
  options: readonly DiscoveryMentionOption[],
): MarkdownInlinePlugin[] {
  const lookup = buildSerializedMentionLookup(options);
  const serializedMentions = Array.from(lookup.keys()).sort(
    (a, b) => b.length - a.length,
  );

  if (serializedMentions.length === 0) {
    return [];
  }

  const pattern = new RegExp(
    serializedMentions.map(escapeRegExp).join("|"),
    "g",
  );

  return [
    {
      pattern,
      getEndIndex: (text, match) => {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (
          !hasMentionPrefixBoundary(text, start) ||
          !hasMentionSuffixBoundary(text, end)
        ) {
          return false;
        }
        return end;
      },
      render: (match, key) => {
        const option = lookup.get(match[0]);
        if (!option) {
          return match[0];
        }
        return (
          <Badge
            key={key}
            label={match[0]}
            variant={mentionTokenColor(option.kind)}
          />
        );
      },
    },
  ];
}
