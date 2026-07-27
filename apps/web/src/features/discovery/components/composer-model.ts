import { MAX_ATTACHMENT_BYTES } from "../schemas";
import type { DiscoveryAttachmentView } from "../attachment-types";
import type { AgentKind } from "./agent-marker";

export const MAX_COMPOSER_ATTACHMENTS = 10;

export type DiscoveryMentionOption = {
  id: string;
  label: string;
  handle: string;
  kind: "human" | AgentKind;
  userId?: string;
  description?: string;
};

export type QueuedDiscoveryAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
};

export type StagedComposerAttachment =
  | (QueuedDiscoveryAttachment & { status: "uploading" })
  | (QueuedDiscoveryAttachment & {
      status: "failed";
      error: string;
    })
  | (QueuedDiscoveryAttachment & {
      status: "uploaded";
      uploaded: DiscoveryAttachmentView;
    })
  | (QueuedDiscoveryAttachment & {
      status: "discarding";
      uploaded: DiscoveryAttachmentView;
    });

export type ReadyDiscoveryComposerAttachment = Extract<
  StagedComposerAttachment,
  { status: "uploaded" }
>;

export type DiscoveryComposerSubmission = {
  body: string;
  attachments: ReadyDiscoveryComposerAttachment[];
  mentionedUserIds: string[];
  mentionedAgentKinds: AgentKind[];
};

export function isReadyComposerAttachment(
  attachment: StagedComposerAttachment,
): attachment is ReadyDiscoveryComposerAttachment {
  return attachment.status === "uploaded";
}

export type MarkdownFormat =
  | "bold"
  | "italic"
  | "strikethrough"
  | "link"
  | "bulleted-list"
  | "numbered-list"
  | "quote"
  | "inline-code"
  | "code-block";

type FormattedText = {
  text: string;
  selectFrom: number;
  selectLength: number;
};

const ALLOWED_COMPOSER_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function wrap(marker: string, selected: string): FormattedText {
  return {
    text: `${marker}${selected}${marker}`,
    selectFrom: marker.length,
    selectLength: selected.length,
  };
}

function prefixLines(prefix: string, selected: string): FormattedText {
  const text = selected
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");

  return {
    text,
    selectFrom: prefix.length,
    selectLength: text.length - prefix.length,
  };
}

function prefixNumberedLines(selected: string): FormattedText {
  const text = selected
    .split("\n")
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");

  return {
    text,
    selectFrom: 3,
    selectLength: text.length - 3,
  };
}

const FORMATTERS: Record<
  MarkdownFormat,
  (selected: string) => FormattedText
> = {
  bold: (selected) => wrap("**", selected || "bold text"),
  italic: (selected) => wrap("_", selected || "italic text"),
  strikethrough: (selected) => wrap("~~", selected || "struck text"),
  link: (selected) => ({
    text: `[${selected || "link text"}](https://)`,
    selectFrom: 1,
    selectLength: (selected || "link text").length,
  }),
  "bulleted-list": (selected) =>
    prefixLines("- ", selected || "list item"),
  "numbered-list": (selected) =>
    prefixNumberedLines(selected || "list item"),
  quote: (selected) => prefixLines("> ", selected || "quote"),
  "inline-code": (selected) => wrap("`", selected || "code"),
  "code-block": (selected) => ({
    text: `\`\`\`\n${selected || "code"}\n\`\`\``,
    selectFrom: 4,
    selectLength: (selected || "code").length,
  }),
};

export function applyMarkdownFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  format: MarkdownFormat,
) {
  const start = Math.max(
    0,
    Math.min(value.length, selectionStart, selectionEnd),
  );
  const end = Math.max(
    start,
    Math.min(value.length, Math.max(selectionStart, selectionEnd)),
  );
  const formatted = FORMATTERS[format](value.slice(start, end));

  return {
    value: `${value.slice(0, start)}${formatted.text}${value.slice(end)}`,
    selectionStart: start + formatted.selectFrom,
    selectionEnd:
      start + formatted.selectFrom + formatted.selectLength,
  };
}

const MARKDOWN_MENTION_DELIMITERS = ["**", "~~", "_", "`"] as const;

export function hasMentionPrefixBoundary(value: string, index: number) {
  return index === 0 || /[\s([{'"]/.test(value.charAt(index - 1));
}

export function hasMentionSuffixBoundary(value: string, index: number) {
  if (index === value.length) {
    return true;
  }

  const nextCharacter = value.charAt(index);
  if (/[\s,!?:;()[\]{}'"]/.test(nextCharacter)) {
    return true;
  }

  return (
    nextCharacter === "." &&
    (index + 1 === value.length || /\s/.test(value.charAt(index + 1)))
  );
}

function expandPairedMarkdownBoundaries(
  value: string,
  start: number,
  end: number,
) {
  let expandedStart = start;
  let expandedEnd = end;

  while (true) {
    const delimiter = MARKDOWN_MENTION_DELIMITERS.find(
      (candidate) =>
        value.slice(expandedStart - candidate.length, expandedStart) ===
          candidate &&
        value.slice(expandedEnd, expandedEnd + candidate.length) ===
          candidate,
    );
    if (!delimiter) {
      return { start: expandedStart, end: expandedEnd };
    }

    expandedStart -= delimiter.length;
    expandedEnd += delimiter.length;
  }
}

function containsSerializedMention(
  value: string,
  option: DiscoveryMentionOption,
) {
  const names = new Set([option.label, option.handle].filter(Boolean));

  for (const name of names) {
    const serializedMention = `@${name}`;
    let searchFrom = 0;

    while (searchFrom < value.length) {
      const mentionStart = value.indexOf(serializedMention, searchFrom);
      if (mentionStart === -1) {
        break;
      }

      const mentionEnd = mentionStart + serializedMention.length;
      const boundaries = expandPairedMarkdownBoundaries(
        value,
        mentionStart,
        mentionEnd,
      );
      if (
        hasMentionPrefixBoundary(value, boundaries.start) &&
        hasMentionSuffixBoundary(value, boundaries.end)
      ) {
        return true;
      }

      searchFrom = mentionStart + 1;
    }
  }

  return false;
}

export function deriveMentionSubmission(
  value: string,
  options: readonly DiscoveryMentionOption[],
) {
  const mentionedUserIds = new Set<string>();
  const mentionedAgentKinds = new Set<AgentKind>();

  for (const option of options) {
    if (!containsSerializedMention(value, option)) {
      continue;
    }

    if (option.kind === "human") {
      if (option.userId) {
        mentionedUserIds.add(option.userId);
      }
    } else {
      mentionedAgentKinds.add(option.kind);
    }
  }

  return {
    mentionedUserIds: Array.from(mentionedUserIds),
    mentionedAgentKinds: Array.from(mentionedAgentKinds),
  };
}

export type MentionTokenColor = "blue" | "purple" | "teal";

export function mentionTokenColor(
  kind: DiscoveryMentionOption["kind"],
): MentionTokenColor {
  if (kind === "human") {
    return "blue";
  }
  return kind === "product" ? "purple" : "teal";
}

export function buildSerializedMentionLookup(
  options: readonly DiscoveryMentionOption[],
): Map<string, DiscoveryMentionOption> {
  const lookup = new Map<string, DiscoveryMentionOption>();

  for (const option of options) {
    for (const name of new Set(
      [option.label, option.handle].filter(Boolean),
    )) {
      lookup.set(`@${name}`, option);
    }
  }

  return lookup;
}

function fileIdentity(file: File) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

export function validateQueuedFiles(
  current: readonly QueuedDiscoveryAttachment[],
  incoming: readonly File[],
) {
  const accepted: QueuedDiscoveryAttachment[] = [];
  const errors: string[] = [];
  const queuedIdentities = new Set(
    current.map(({ file }) => fileIdentity(file)),
  );

  for (const file of incoming) {
    if (!ALLOWED_COMPOSER_MIME_TYPES.has(file.type)) {
      errors.push(`${file.name} is not a supported file type.`);
      continue;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`${file.name} is larger than 10 MB.`);
      continue;
    }

    const identity = fileIdentity(file);
    if (queuedIdentities.has(identity)) {
      errors.push(`${file.name} is already queued.`);
      continue;
    }

    if (
      current.length + accepted.length >=
      MAX_COMPOSER_ATTACHMENTS
    ) {
      errors.push("You can attach up to 10 files.");
      continue;
    }

    queuedIdentities.add(identity);
    accepted.push({
      id: crypto.randomUUID(),
      file,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
    });
  }

  return { accepted, errors };
}
