"use client";

import {
  ChatComposer,
  ChatComposerInput,
  ChatSendButton,
} from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { VStack } from "@astryxdesign/core/VStack";
import { At } from "@boxicons/react/At";
import { ArrowUp } from "@boxicons/react/ArrowUp";
import { Plus } from "@boxicons/react/Plus";
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import type { DiscoveryAttachmentView } from "../attachment-types";
import { DiscoveryComposerAttachments } from "./composer-attachments";
import { COMPOSER_FORMAT_ACTIONS } from "./composer-format-actions";
import {
  deriveMentionSubmission,
  isReadyComposerAttachment,
  type DiscoveryComposerSubmission,
  type DiscoveryMentionOption,
  type QueuedDiscoveryAttachment,
} from "./composer-model";
import { removeMentionBeforeCaret } from "./editor-selection";
import { useComposerAttachments } from "./use-composer-attachments";
import { useComposerEditor } from "./use-composer-editor";
import { useComposerMentions } from "./use-composer-mentions";

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
  const [isFormattingOpen, setIsFormattingOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Destructured rather than held as objects: these callbacks are
  // individually memoised, and depending on them by name keeps `submit` and
  // the key handler stable across the re-render every keystroke causes.
  const {
    editorRef,
    inputHandleRef,
    getEditor,
    handleChange,
    rememberSelection,
    formatMessage,
    insertText,
    beginDraftSubmission,
    restoreDraftIfUnedited,
  } = useComposerEditor({ value, onChange });
  const {
    items: attachmentItems,
    error: attachmentError,
    queueFiles,
    removeAttachment,
    areAllReady,
    beginSubmission,
    completeSubmission,
    cancelSubmission,
  } = useComposerAttachments({
    onStageAttachment,
    onDiscardStagedAttachment,
  });
  const mentionTrigger = useComposerMentions(mentions);

  const submit = useCallback(
    async (body: string) => {
      const normalizedBody = body.trim();
      if (!normalizedBody || !areAllReady()) {
        return;
      }
      const submittedRevision = beginDraftSubmission();
      const reserved = beginSubmission();
      const submission: DiscoveryComposerSubmission = {
        body: normalizedBody,
        attachments: reserved,
        ...deriveMentionSubmission(normalizedBody, mentions),
      };

      try {
        const didSubmit = await onSubmit(submission);
        if (!didSubmit) {
          cancelSubmission(reserved);
          restoreDraftIfUnedited(
            submittedRevision,
            normalizedBody,
          );
          return;
        }
        completeSubmission(reserved);
      } catch {
        cancelSubmission(reserved);
        restoreDraftIfUnedited(
          submittedRevision,
          normalizedBody,
        );
      }
    },
    [
      areAllReady,
      beginDraftSubmission,
      beginSubmission,
      cancelSubmission,
      completeSubmission,
      mentions,
      onSubmit,
      restoreDraftIfUnedited,
    ],
  );

  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const eventTarget = event.target;
      const editorElement =
        eventTarget instanceof HTMLElement &&
        eventTarget.getAttribute("contenteditable") === "true"
          ? eventTarget
          : getEditor();
      if (!editorElement) {
        return;
      }

      if (
        event.key === "Backspace" &&
        removeMentionBeforeCaret(editorElement)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // Enter must not send while an upload is still settling.
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !areAllReady()
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [areAllReady, getEditor],
  );

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

  const failedAttachment = attachmentItems.find(
    (attachment) => attachment.status === "failed",
  );
  const visibleStatus =
    attachmentError ??
    (failedAttachment?.status === "failed"
      ? `${failedAttachment.file.name}: ${failedAttachment.error}`
      : status);
  const canSubmit =
    value.trim().length > 0 &&
    attachmentItems.every(isReadyComposerAttachment);

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
                  {COMPOSER_FORMAT_ACTIONS.map((action) => (
                    <IconButton
                      key={action.format}
                      label={action.label}
                      tooltip={action.label}
                      icon={action.icon}
                      variant="ghost"
                      size="sm"
                      onMouseDown={rememberSelection}
                      onClick={() =>
                        formatMessage(action.format)
                      }
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
              attachments={attachmentItems}
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
                queueFiles(
                  Array.from(event.currentTarget.files ?? []),
                );
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
              icon={
                <Text type="supporting" color="inherit">
                  Aa
                </Text>
              }
              isIconOnly
              size="sm"
            />
            <IconButton
              label="Mention someone"
              tooltip="Mention someone"
              icon={<Icon icon={At} size="sm" />}
              variant="ghost"
              size="sm"
              onClick={() => insertText("@")}
            />
          </HStack>
        }
        sendButton={
          <ChatSendButton
            isDisabled={!canSubmit}
            sendIcon={<Icon icon={ArrowUp} size="md" />}
          />
        }
      />
    </VStack>
  );
}
