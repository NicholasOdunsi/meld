import type { Provider } from "@meld/contracts";
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
  mentionsProductAgent: boolean;
  providerOverride?: Provider;
};

// The room-scoped draft persisted to sessionStorage when a Product Agent
// mention finds no ready provider and the user is routed to AI setup. It holds
// ONLY what is needed to reconstruct the composer on return: the body text, the
// semantic mention ranges, the chosen provider, and the ids of already-staged
// attachments. It never holds attachment bytes or any server-returned content
// -- the staged attachments still live server-side under their ids.
export type RoomDraft = {
  body: string;
  providerOverride?: Provider;
  attachmentIds: string[];
  mentionRanges: Array<{ start: number; end: number }>;
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

// Offsets of every semantic Product Agent mention in the serialized body. This
// is a boundary-checked scan of the mention token, not a substring search: the
// same prefix/suffix boundary rules deriveMentionSubmission uses, so
// "the product agent idea" (no token) yields nothing.
export function deriveProductMentionRanges(
  value: string,
  options: readonly DiscoveryMentionOption[],
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];

  for (const option of options) {
    if (option.kind !== "product") {
      continue;
    }
    for (const name of new Set(
      [option.label, option.handle].filter(Boolean),
    )) {
      const serializedMention = `@${name}`;
      let searchFrom = 0;
      while (searchFrom < value.length) {
        const start = value.indexOf(serializedMention, searchFrom);
        if (start === -1) {
          break;
        }
        const end = start + serializedMention.length;
        const boundaries = expandPairedMarkdownBoundaries(value, start, end);
        if (
          hasMentionPrefixBoundary(value, boundaries.start) &&
          hasMentionSuffixBoundary(value, boundaries.end)
        ) {
          ranges.push({ start, end });
        }
        searchFrom = start + 1;
      }
    }
  }

  return ranges.sort((left, right) => left.start - right.start);
}

const DRAFT_PROVIDERS: ReadonlySet<Provider> = new Set(["codex", "claude"]);

export function serializeRoomDraft(draft: RoomDraft): string {
  return JSON.stringify(draft);
}

// Parse a persisted draft back into a RoomDraft, dropping anything that is not
// exactly the room-scoped shape. Untrusted sessionStorage input never becomes
// attachment bytes or server content: only a string body, string ids, a known
// provider, and numeric ranges survive.
export function parseRoomDraft(raw: string | null): RoomDraft | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.body !== "string") {
    return null;
  }

  const attachmentIds = Array.isArray(record.attachmentIds)
    ? record.attachmentIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];

  const mentionRanges = Array.isArray(record.mentionRanges)
    ? record.mentionRanges.flatMap((range) => {
        if (
          typeof range === "object" &&
          range !== null &&
          typeof (range as { start?: unknown }).start === "number" &&
          typeof (range as { end?: unknown }).end === "number"
        ) {
          const { start, end } = range as { start: number; end: number };
          return [{ start, end }];
        }
        return [];
      })
    : [];

  const providerOverride =
    typeof record.providerOverride === "string" &&
    DRAFT_PROVIDERS.has(record.providerOverride as Provider)
      ? (record.providerOverride as Provider)
      : undefined;

  return {
    body: record.body,
    providerOverride,
    attachmentIds,
    mentionRanges,
  };
}

export function roomDraftStorageKey(roomId: string): string {
  return `discovery-draft:${roomId}`;
}

// --- Draft-return open-redirect boundary ------------------------------------
//
// When no provider is ready we send the user to AI setup with a returnTo that
// points back at the exact room they were composing in. The setup flow will
// navigate to that path, so it is an open-redirect surface: an attacker who can
// seed the value must not be able to send the browser off-origin or into
// another organization. This validator is the single gate. It accepts ONLY a
// relative Discovery Room path inside the given organization and rejects
// everything else -- absolute URLs, protocol-relative URLs, backslash tricks,
// encoded traversal, and another organization's id.

const ROOM_PATH = /^\/[0-9a-fA-F-]{36}\/discovery\/[0-9a-fA-F-]{36}$/;

export function isValidRoomReturnPath(
  returnTo: string,
  organizationId: string,
): boolean {
  if (typeof returnTo !== "string" || returnTo.length === 0) {
    return false;
  }

  // Reject before any decoding: an absolute or scheme-relative URL, a
  // backslash (which some browsers treat as a path separator toward another
  // host), or whitespace/control characters (which also stops CR/LF smuggling)
  // never appear in a legitimate room path.
  if (
    returnTo.includes("\\") ||
    returnTo.includes("://") ||
    returnTo.startsWith("//") ||
    /[\u0000-\u001f\u007f ]/.test(returnTo)
  ) {
    return false;
  }

  // A single explicit decode surfaces %2e%2e / %2f traversal so it is measured
  // against the pattern below rather than sailing through pre-decode. Any
  // encoding at all changes the string, which is itself disqualifying; a
  // malformed escape (throwing) is rejected outright.
  let decoded: string;
  try {
    decoded = decodeURIComponent(returnTo);
  } catch {
    return false;
  }

  if (
    decoded !== returnTo ||
    decoded.includes("..") ||
    decoded.includes("//") ||
    decoded.includes("\\")
  ) {
    return false;
  }

  if (!ROOM_PATH.test(decoded)) {
    return false;
  }

  // The organization segment must be exactly the current organization: a
  // well-formed room path under a different org id is still an escape.
  return decoded.startsWith(`/${organizationId}/discovery/`);
}

// Build the room path a returnTo should carry. Returns null (never an unsafe
// string) if the ids do not compose a valid in-organization room path, so a
// caller can decline to navigate rather than emit an open redirect.
export function buildRoomReturnPath(
  organizationId: string,
  roomId: string,
): string | null {
  const path = `/${organizationId}/discovery/${roomId}`;
  return isValidRoomReturnPath(path, organizationId) ? path : null;
}
