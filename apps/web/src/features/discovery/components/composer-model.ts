import { MAX_ATTACHMENT_BYTES } from "../schemas";
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

export type DiscoveryComposerSubmission = {
  body: string;
  attachments: QueuedDiscoveryAttachment[];
  mentionedUserIds: string[];
  mentionedAgentKinds: AgentKind[];
};

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsSerializedMention(
  value: string,
  option: DiscoveryMentionOption,
) {
  const names = Array.from(
    new Set([option.label, option.handle].filter(Boolean)),
  )
    .map(escapeRegExp)
    .join("|");
  const mentionPattern = new RegExp(
    `(?:^|[\\s([{'"])@(?:${names})(?=$|[\\s,!?:;()[\\]{}'"]|\\.(?:$|\\s))`,
  );

  return mentionPattern.test(value);
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
