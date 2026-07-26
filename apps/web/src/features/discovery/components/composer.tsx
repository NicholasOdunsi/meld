"use client";

import { Avatar } from "@astryxdesign/core/Avatar";
import {
  ChatComposer,
  ChatComposerInput,
  ChatSendButton,
  type ChatComposerInputHandle,
  type ChatComposerTrigger,
} from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  createStaticSource,
  type SearchableItem,
  TypeaheadItem,
} from "@astryxdesign/core/Typeahead";
import { VStack } from "@astryxdesign/core/VStack";
import { At } from "@boxicons/react/At";
import { ArrowUp } from "@boxicons/react/ArrowUp";
import { Bold } from "@boxicons/react/Bold";
import { Code } from "@boxicons/react/Code";
import { Italic } from "@boxicons/react/Italic";
import { Link } from "@boxicons/react/Link";
import { ListOl } from "@boxicons/react/ListOl";
import { ListUl } from "@boxicons/react/ListUl";
import { Plus } from "@boxicons/react/Plus";
import { QuoteLeft } from "@boxicons/react/QuoteLeft";
import { Strikethrough } from "@boxicons/react/Strikethrough";
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DiscoveryAttachmentView } from "../attachment-types";
import { AgentMarker } from "./agent-marker";
import { DiscoveryComposerAttachments } from "./composer-attachments";
import {
  applyMarkdownFormat,
  deriveMentionSubmission,
  type DiscoveryComposerSubmission,
  type DiscoveryMentionOption,
  isReadyComposerAttachment,
  type MarkdownFormat,
  type QueuedDiscoveryAttachment,
  type ReadyDiscoveryComposerAttachment,
  type StagedComposerAttachment,
  validateQueuedFiles,
} from "./composer-model";

const sidebarSurfaceComposerStyle = {
  "--color-background-popover": "var(--color-background-surface)",
} as CSSProperties;

const composerInputStyle = {
  minBlockSize: "var(--spacing-8)",
} as CSSProperties;

const ACCEPTED_ATTACHMENT_TYPES = [
  ".txt",
  ".md",
  ".pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
].join(",");

type MentionSearchItem = SearchableItem<DiscoveryMentionOption>;

type SerializedSelection = {
  start: number;
  end: number;
};

type FormatAction = {
  format: MarkdownFormat;
  label: string;
  icon: ReactNode;
};

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (!(node instanceof Element || node instanceof DocumentFragment)) {
    return "";
  }
  if (
    node instanceof HTMLElement &&
    node.hasAttribute("data-astryx-token")
  ) {
    return node.getAttribute("data-astryx-token-value") ?? "";
  }
  if (node instanceof HTMLElement && node.tagName === "BR") {
    return "\n";
  }
  return Array.from(node.childNodes).map(serializeNode).join("");
}

function serializedOffset(
  editor: HTMLElement,
  boundaryNode: Node,
  boundaryOffset: number,
) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.setEnd(boundaryNode, boundaryOffset);
  return serializeNode(range.cloneContents());
}

function readEditorSelection(
  editor: HTMLElement | null,
  fallbackOffset: number,
): SerializedSelection {
  const selection = window.getSelection();
  if (!editor || !selection || selection.rangeCount === 0) {
    return { start: fallbackOffset, end: fallbackOffset };
  }
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    return { start: fallbackOffset, end: fallbackOffset };
  }
  return {
    start: serializedOffset(
      editor,
      range.startContainer,
      range.startOffset,
    ).length,
    end: serializedOffset(
      editor,
      range.endContainer,
      range.endOffset,
    ).length,
  };
}

function locateSerializedOffset(editor: HTMLElement, target: number) {
  let remaining = target;

  function visit(parent: Node): { node: Node; offset: number } | null {
    for (let index = 0; index < parent.childNodes.length; index += 1) {
      const child = parent.childNodes[index];
      if (child.nodeType === Node.TEXT_NODE) {
        const length = child.textContent?.length ?? 0;
        if (remaining <= length) {
          return { node: child, offset: remaining };
        }
        remaining -= length;
        continue;
      }

      if (
        child instanceof HTMLElement &&
        child.hasAttribute("data-astryx-token")
      ) {
        const length =
          child.getAttribute("data-astryx-token-value")?.length ?? 0;
        if (remaining <= length) {
          return {
            node: parent,
            offset: remaining === 0 ? index : index + 1,
          };
        }
        remaining -= length;
        continue;
      }

      if (child instanceof HTMLElement && child.tagName === "BR") {
        if (remaining <= 1) {
          return {
            node: parent,
            offset: remaining === 0 ? index : index + 1,
          };
        }
        remaining -= 1;
        continue;
      }

      const nested = visit(child);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  return visit(editor) ?? {
    node: editor,
    offset: editor.childNodes.length,
  };
}

function restoreEditorSelection(
  editor: HTMLElement | null,
  selectionOffsets: SerializedSelection,
) {
  if (!editor) {
    return;
  }
  const start = locateSerializedOffset(editor, selectionOffsets.start);
  const end = locateSerializedOffset(editor, selectionOffsets.end);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  editor.focus();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function replaceEditorSelection(
  editor: HTMLElement,
  selectionOffsets: SerializedSelection,
  replacement: string,
  replacementSelection: SerializedSelection,
) {
  const start = locateSerializedOffset(editor, selectionOffsets.start);
  const end = locateSerializedOffset(editor, selectionOffsets.end);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  range.deleteContents();

  const replacementNode = document.createTextNode(replacement);
  range.insertNode(replacementNode);

  const nextRange = document.createRange();
  nextRange.setStart(replacementNode, replacementSelection.start);
  nextRange.setEnd(replacementNode, replacementSelection.end);
  const selection = window.getSelection();
  editor.focus();
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function normalizeCaretIntoTextNode(editor: HTMLElement | null) {
  const selection = window.getSelection();
  if (!editor || !selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  if (
    range.startContainer !== editor ||
    range.startOffset === 0
  ) {
    return;
  }
  const previousNode = editor.childNodes.item(range.startOffset - 1);
  if (previousNode?.nodeType !== Node.TEXT_NODE) {
    return;
  }
  range.setStart(previousNode, previousNode.textContent?.length ?? 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function removeMentionBeforeCaret(editor: HTMLElement) {
  const selection = window.getSelection();
  if (
    !selection ||
    !selection.isCollapsed ||
    selection.rangeCount === 0
  ) {
    return false;
  }
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) {
    return false;
  }

  let token: HTMLElement | null = null;
  const trailingSpaces: Node[] = [];
  const { startContainer, startOffset } = range;
  const isTrailingSpace = (node: Node | null) =>
    node?.nodeType === Node.TEXT_NODE &&
    (node.textContent === "" || node.textContent === "\u00a0");
  let previous: Node | null = null;

  if (
    startContainer.nodeType === Node.TEXT_NODE &&
    isTrailingSpace(startContainer) &&
    startOffset <= 1
  ) {
    trailingSpaces.push(startContainer);
    previous = startContainer.previousSibling;
  } else if (startContainer === editor && startOffset > 0) {
    previous = editor.childNodes.item(startOffset - 1);
  }

  while (isTrailingSpace(previous)) {
    trailingSpaces.push(previous!);
    previous = previous?.previousSibling ?? null;
  }
  token =
    previous instanceof HTMLElement &&
    previous.hasAttribute("data-astryx-token")
      ? previous
      : null;

  if (!token) {
    return false;
  }

  const caretOffset = Array.prototype.indexOf.call(
    editor.childNodes,
    token,
  ) as number;
  for (const trailingSpace of trailingSpaces) {
    trailingSpace.parentNode?.removeChild(trailingSpace);
  }
  token.parentNode?.removeChild(token);
  const nextRange = document.createRange();
  nextRange.setStart(editor, Math.max(0, caretOffset));
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message
    ? error.message
    : fallback;
}

function releasePreviews(
  attachments: readonly QueuedDiscoveryAttachment[],
) {
  for (const attachment of attachments) {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }
}

function MentionItem({ item }: { item: SearchableItem }) {
  const option = item.auxiliaryData as DiscoveryMentionOption;
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

export function DiscoveryComposer({
  value,
  onChange,
  onSubmit,
  onStageAttachment,
  onDiscardStagedAttachment,
  mentions,
  status,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (
    submission: DiscoveryComposerSubmission,
  ) => Promise<boolean>;
  onStageAttachment?: (
    attachment: QueuedDiscoveryAttachment,
  ) => Promise<DiscoveryAttachmentView>;
  onDiscardStagedAttachment?: (
    attachmentId: string,
  ) => Promise<void>;
  mentions: readonly DiscoveryMentionOption[];
  status?: string;
}) {
  const [attachments, setAttachments] = useState<
    StagedComposerAttachment[]
  >([]);
  const [isFormattingOpen, setIsFormattingOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string>();
  const editorRef = useRef<HTMLDivElement>(null);
  const inputHandleRef = useRef<ChatComposerInputHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<StagedComposerAttachment[]>([]);
  const reservedAttachmentsRef = useRef(
    new Map<string, ReadyDiscoveryComposerAttachment>(),
  );
  const pendingSelectionRef = useRef<SerializedSelection | null>(null);
  const currentDraftRef = useRef(value);
  const draftRevisionRef = useRef(0);

  const getEditor = useCallback(
    () =>
      editorRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      ) ?? null,
    [],
  );

  useEffect(
    () => () => {
      releasePreviews([
        ...attachmentsRef.current,
        ...reservedAttachmentsRef.current.values(),
      ]);
      attachmentsRef.current = [];
      reservedAttachmentsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    currentDraftRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!pendingSelectionRef.current) {
      return;
    }
    restoreEditorSelection(
      getEditor(),
      pendingSelectionRef.current,
    );
    pendingSelectionRef.current = null;
  }, [getEditor, value]);

  const handleChange = useCallback(
    (nextValue: string) => {
      currentDraftRef.current = nextValue;
      draftRevisionRef.current += 1;
      onChange(nextValue);
    },
    [onChange],
  );

  const updateAttachment = useCallback(
    (
      id: string,
      update: (
        attachment: StagedComposerAttachment,
      ) => StagedComposerAttachment,
    ) => {
      const index = attachmentsRef.current.findIndex(
        (attachment) => attachment.id === id,
      );
      if (index === -1) {
        return false;
      }
      const next = [...attachmentsRef.current];
      next[index] = update(next[index]);
      attachmentsRef.current = next;
      setAttachments(next);
      return true;
    },
    [],
  );

  const queueFiles = useCallback(
    (files: File[]) => {
      const outstandingAttachments = [
        ...attachmentsRef.current,
        ...reservedAttachmentsRef.current.values(),
      ];
      const result = validateQueuedFiles(outstandingAttachments, files);
      if (result.accepted.length > 0) {
        const uploading: StagedComposerAttachment[] =
          result.accepted.map((attachment) => ({
            ...attachment,
            status: "uploading",
          }));
        const next = [...attachmentsRef.current, ...uploading];
        attachmentsRef.current = next;
        setAttachments(next);

        for (const attachment of result.accepted) {
          if (!onStageAttachment) {
            updateAttachment(attachment.id, (current) => ({
              id: current.id,
              file: current.file,
              previewUrl: current.previewUrl,
              status: "failed",
              error: "Upload unavailable",
            }));
            continue;
          }
          void onStageAttachment(attachment).then(
            (uploaded) => {
              updateAttachment(attachment.id, (current) => ({
                id: current.id,
                file: current.file,
                previewUrl: current.previewUrl,
                status: "uploaded",
                uploaded,
              }));
            },
            (error: unknown) => {
              updateAttachment(attachment.id, (current) => ({
                id: current.id,
                file: current.file,
                previewUrl: current.previewUrl,
                status: "failed",
                error: errorMessage(error, "Upload failed"),
              }));
            },
          );
        }
      }
      setAttachmentError(
        result.errors.length > 0
          ? result.errors.join(" ")
          : undefined,
      );
    },
    [onStageAttachment, updateAttachment],
  );

  const removeAttachment = useCallback(
    async (id: string) => {
      const removed = attachmentsRef.current.find(
        (attachment) => attachment.id === id,
      );
      if (!removed) {
        return;
      }

      if (removed.status === "uploaded") {
        if (!onDiscardStagedAttachment) {
          setAttachmentError(
            `${removed.file.name}: Discard unavailable`,
          );
          return;
        }
        try {
          await onDiscardStagedAttachment(removed.uploaded.id);
        } catch (error) {
          setAttachmentError(
            `${removed.file.name}: ${errorMessage(
              error,
              "Discard failed",
            )}`,
          );
          return;
        }
      }

      const stillQueued = attachmentsRef.current.find(
        (attachment) => attachment.id === id,
      );
      if (!stillQueued) {
        return;
      }
      releasePreviews([stillQueued]);
      const next = attachmentsRef.current.filter(
        (attachment) => attachment.id !== id,
      );
      attachmentsRef.current = next;
      setAttachments(next);
      setAttachmentError(undefined);
    },
    [onDiscardStagedAttachment],
  );

  const submit = useCallback(
    async (body: string) => {
      const normalizedBody = body.trim();
      if (
        !normalizedBody ||
        !attachmentsRef.current.every(isReadyComposerAttachment)
      ) {
        return;
      }
      const submittedDraftRevision = draftRevisionRef.current;
      const submittedAttachments = attachmentsRef.current.filter(
        isReadyComposerAttachment,
      );
      for (const attachment of submittedAttachments) {
        reservedAttachmentsRef.current.set(
          attachment.id,
          attachment,
        );
      }
      attachmentsRef.current = [];
      setAttachments([]);
      const submission: DiscoveryComposerSubmission = {
        body: normalizedBody,
        attachments: submittedAttachments,
        ...deriveMentionSubmission(normalizedBody, mentions),
      };

      const releaseReservation = () =>
        submittedAttachments.filter((attachment) =>
          reservedAttachmentsRef.current.delete(attachment.id),
        );
      const restoreReservation = () => {
        const releasedAttachments = releaseReservation();
        if (releasedAttachments.length === 0) {
          return;
        }
        const queuedIds = new Set(
          attachmentsRef.current.map(({ id }) => id),
        );
        const next = [
          ...releasedAttachments.filter(
            ({ id }) => !queuedIds.has(id),
          ),
          ...attachmentsRef.current,
        ];
        attachmentsRef.current = next;
        setAttachments(next);
      };

      try {
        const didSubmit = await onSubmit(submission);
        if (!didSubmit) {
          restoreReservation();
          if (
            currentDraftRef.current === "" &&
            draftRevisionRef.current === submittedDraftRevision + 1
          ) {
            handleChange(normalizedBody);
          }
          return;
        }

        const sentAttachments = releaseReservation();
        releasePreviews(sentAttachments);
        setAttachmentError(undefined);
      } catch {
        restoreReservation();
        if (
          currentDraftRef.current === "" &&
          draftRevisionRef.current === submittedDraftRevision + 1
        ) {
          handleChange(normalizedBody);
        }
      }
    },
    [handleChange, mentions, onSubmit],
  );

  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const eventTarget = event.target;
      const editor =
        eventTarget instanceof HTMLElement &&
        eventTarget.getAttribute("contenteditable") === "true"
          ? eventTarget
          : getEditor();
      if (!editor) {
        return;
      }

      if (
        event.key === "Backspace" &&
        removeMentionBeforeCaret(editor)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !attachmentsRef.current.every(isReadyComposerAttachment)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [getEditor],
  );

  const mentionItems = useMemo<MentionSearchItem[]>(
    () =>
      mentions.map((option) => ({
        id: option.id,
        label: option.label,
        auxiliaryData: option,
      })),
    [mentions],
  );
  const mentionTrigger = useMemo<ChatComposerTrigger>(
    () => ({
      character: "@",
      searchSource: createStaticSource(mentionItems, {
        keywords: (item) => {
          const option =
            item.auxiliaryData as DiscoveryMentionOption;
          return [option.handle, option.description ?? ""];
        },
      }),
      renderItem: (item) => <MentionItem item={item} />,
      onSelect: (item) => {
        const option = item.auxiliaryData as DiscoveryMentionOption;
        return {
          value: `@${option.label}`,
          label: `@${option.label}`,
          variant:
            option.kind === "human"
              ? "blue"
              : option.kind === "product"
                ? "purple"
                : "teal",
        };
      },
      menuLabel: "Mention a teammate or agent",
    }),
    [mentionItems],
  );

  const rememberSelection = useCallback(() => {
    pendingSelectionRef.current = readEditorSelection(
      getEditor(),
      value.length,
    );
  }, [getEditor, value.length]);

  const formatMessage = useCallback(
    (format: MarkdownFormat) => {
      const editor = getEditor();
      if (!editor) {
        return;
      }
      const selection =
        pendingSelectionRef.current ??
        readEditorSelection(editor, value.length);
      const selectedValue = value.slice(
        selection.start,
        selection.end,
      );
      const formatted = applyMarkdownFormat(
        selectedValue,
        0,
        selectedValue.length,
        format,
      );
      pendingSelectionRef.current = null;
      replaceEditorSelection(
        editor,
        selection,
        formatted.value,
        {
          start: formatted.selectionStart,
          end: formatted.selectionEnd,
        },
      );
    },
    [getEditor, value],
  );

  const formatActions = useMemo<FormatAction[]>(
    () => [
      {
        format: "bold",
        label: "Bold",
        icon: <Icon icon={Bold} size="sm" />,
      },
      {
        format: "italic",
        label: "Italic",
        icon: <Icon icon={Italic} size="sm" />,
      },
      {
        format: "strikethrough",
        label: "Strikethrough",
        icon: <Icon icon={Strikethrough} size="sm" />,
      },
      {
        format: "link",
        label: "Link",
        icon: <Icon icon={Link} size="sm" />,
      },
      {
        format: "bulleted-list",
        label: "Bulleted list",
        icon: <Icon icon={ListUl} size="sm" />,
      },
      {
        format: "numbered-list",
        label: "Numbered list",
        icon: <Icon icon={ListOl} size="sm" />,
      },
      {
        format: "quote",
        label: "Quote",
        icon: <Icon icon={QuoteLeft} size="sm" />,
      },
      {
        format: "inline-code",
        label: "Inline code",
        icon: <Icon icon={Code} size="sm" />,
      },
      {
        format: "code-block",
        label: "Code block",
        icon: <Icon icon={Code} size="sm" />,
      },
    ],
    [],
  );

  const openMentionPicker = useCallback(() => {
    inputHandleRef.current?.focus();
    inputHandleRef.current?.insertText("@");
    const editor = getEditor();
    normalizeCaretIntoTextNode(editor);
    editor?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [getEditor]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      queueFiles(files);
    },
    [queueFiles],
  );
  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    [],
  );

  const failedAttachment = attachments.find(
    (attachment) => attachment.status === "failed",
  );
  const visibleStatus =
    attachmentError ??
    (failedAttachment?.status === "failed"
      ? `${failedAttachment.file.name}: ${failedAttachment.error}`
      : status);
  const canSubmit =
    value.trim().length > 0 &&
    attachments.every(isReadyComposerAttachment);

  return (
    <VStack gap={2}>
      <ChatComposer
        data-testid="discovery-chat-composer"
        density="compact"
        value={value}
        onChange={handleChange}
        onSubmit={submit}
        style={sidebarSurfaceComposerStyle}
        placeholder="Ask a question or share a discovery note"
        status={
          visibleStatus
            ? { type: "error", message: visibleStatus }
            : undefined
        }
        headerActions={
          isFormattingOpen ? (
            <Toolbar
              label="Format message"
              size="sm"
              startContent={
                <HStack gap={0.5} wrap="wrap">
                  {formatActions.map((action) => (
                    <IconButton
                      key={action.format}
                      label={action.label}
                      tooltip={action.label}
                      icon={action.icon}
                      variant="ghost"
                      size="sm"
                      onMouseDown={rememberSelection}
                      onClick={() => formatMessage(action.format)}
                    />
                  ))}
                </HStack>
              }
            />
          ) : undefined
        }
        input={
          <VStack gap={1} width="100%">
            <DiscoveryComposerAttachments
              attachments={attachments}
              onRemove={(attachmentId) => {
                void removeAttachment(attachmentId);
              }}
            />
            <ChatComposerInput
              ref={editorRef}
              handleRef={inputHandleRef}
              value={value}
              onChange={handleChange}
              onSubmit={submit}
              onFiles={queueFiles}
              onKeyDownCapture={handleKeyDownCapture}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              triggers={[mentionTrigger]}
              label="Message"
              placeholder="Ask a question or share a discovery note"
              maxRows={isFormattingOpen ? 12 : 8}
              pasteAsToken={false}
              style={composerInputStyle}
            />
          </VStack>
        }
        footerActions={
          <HStack gap={1} vAlign="center">
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Add files or images"
              accept={ACCEPTED_ATTACHMENT_TYPES}
              multiple
              hidden
              onChange={(event) => {
                queueFiles(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }}
            />
            <IconButton
              label="Add files or images"
              tooltip="Add files or images"
              icon={<Icon icon={Plus} size="sm" />}
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            />
            <ToggleButton
              label="Formatting"
              tooltip="Formatting"
              isPressed={isFormattingOpen}
              onPressedChange={setIsFormattingOpen}
              icon={<Text type="supporting">Aa</Text>}
              isIconOnly
              size="sm"
            />
            <IconButton
              label="Mention someone"
              tooltip="Mention someone"
              icon={<Icon icon={At} size="sm" />}
              variant="ghost"
              size="sm"
              onClick={openMentionPicker}
            />
          </HStack>
        }
        sendButton={
          <ChatSendButton
            isDisabled={!canSubmit}
            sendIcon={<Icon icon={ArrowUp} size="sm" />}
          />
        }
      />
    </VStack>
  );
}
