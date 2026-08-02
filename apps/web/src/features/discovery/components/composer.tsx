"use client";

import {
  ChatComposer,
  ChatComposerInput,
  ChatSendButton,
} from "@astryxdesign/core/Chat";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { VStack } from "@astryxdesign/core/VStack";
import { At } from "@boxicons/react/At";
import { ArrowUp } from "@boxicons/react/ArrowUp";
import { Plus } from "@boxicons/react/Plus";
import type { Provider } from "@meld/contracts";
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { ACCEPTED_ATTACHMENT_FILE_TYPES } from "../attachment-mime";
import type { DiscoveryAttachmentView } from "../attachment-types";
import { DiscoveryComposerAttachments } from "./composer-attachments";
import { COMPOSER_FORMAT_ACTIONS } from "./composer-format-actions";
import {
  deriveMentionSubmission,
  deriveProductMentionRanges,
  isReadyComposerAttachment,
  type DiscoveryComposerSubmission,
  type DiscoveryMentionOption,
  type QueuedDiscoveryAttachment,
  type RoomDraft,
} from "./composer-model";

const PROVIDER_LABEL: Record<Provider, string> = {
  codex: "Codex",
  claude: "Claude",
};
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

export function DiscoveryComposer({
  value,
  onChange,
  onSubmit,
  onStageAttachment,
  onDiscardStagedAttachment,
  mentions,
  status,
  agentReadiness,
  onConnectPersonalAI,
  initialProviderOverride,
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
  // Undefined while readiness is still loading; a Product Agent mention cannot
  // be sent until this resolves ready.
  agentReadiness?: AgentReadiness;
  // Invoked instead of submitting when a Product Agent mention has no ready
  // provider: the caller persists the draft and routes to AI setup.
  onConnectPersonalAI?: (draft: RoomDraft) => void;
  initialProviderOverride?: Provider;
}) {
  const [isFormattingOpen, setIsFormattingOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<
    Provider | undefined
  >(initialProviderOverride);
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

  // A semantic Product Agent mention in the *current* draft. Drives the picker
  // and the connect prompt; the send path re-derives from the normalized body.
  const draftMentionsProductAgent = useMemo(
    () =>
      deriveMentionSubmission(value, mentions).mentionedAgentKinds.includes(
        "product",
      ),
    [value, mentions],
  );

  const readyProviders =
    agentReadiness?.ready === true ? agentReadiness.providers : [];

  // The provider the picker shows and the send forwards: the explicit choice if
  // still runnable, otherwise the saved default.
  const effectiveProvider: Provider | undefined =
    agentReadiness?.ready === true
      ? readyProviders.some(
          (candidate) => candidate.provider === selectedProvider,
        )
        ? selectedProvider
        : agentReadiness.defaultProvider
      : undefined;

  const submit = useCallback(
    async (body: string) => {
      const normalizedBody = body.trim();
      // An attachment with no text is a valid message; only block a send that
      // is genuinely empty (no text and no settled attachment).
      const hasAttachmentToSend = attachmentItems.some(
        isReadyComposerAttachment,
      );
      if ((!normalizedBody && !hasAttachmentToSend) || !areAllReady()) {
        return;
      }

      const mention = deriveMentionSubmission(normalizedBody, mentions);
      const mentionsProductAgent =
        mention.mentionedAgentKinds.includes("product");

      // Readiness preflight: a Product Agent mention with no ready provider is
      // never submitted. The full draft is handed off (body, semantic mention
      // ranges, provider, staged attachment ids) and the composer keeps its
      // contents -- nothing is reserved, cleared, or sent.
      if (mentionsProductAgent && agentReadiness?.ready !== true) {
        onConnectPersonalAI?.({
          body: normalizedBody,
          providerOverride: selectedProvider,
          attachmentIds: attachmentItems
            .filter(isReadyComposerAttachment)
            .map((attachment) => attachment.uploaded.id),
          mentionRanges: deriveProductMentionRanges(normalizedBody, mentions),
        });
        return;
      }

      const submittedRevision = beginDraftSubmission();
      const reserved = beginSubmission();
      const submission: DiscoveryComposerSubmission = {
        body: normalizedBody,
        attachments: reserved,
        ...mention,
        mentionsProductAgent,
        providerOverride: mentionsProductAgent
          ? effectiveProvider
          : undefined,
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
      agentReadiness,
      areAllReady,
      attachmentItems,
      beginDraftSubmission,
      beginSubmission,
      cancelSubmission,
      completeSubmission,
      effectiveProvider,
      mentions,
      onConnectPersonalAI,
      onSubmit,
      restoreDraftIfUnedited,
      selectedProvider,
    ],
  );

  const handleConnectPersonalAI = useCallback(() => {
    const normalizedBody = value.trim();
    onConnectPersonalAI?.({
      body: normalizedBody,
      providerOverride: selectedProvider,
      attachmentIds: attachmentItems
        .filter(isReadyComposerAttachment)
        .map((attachment) => attachment.uploaded.id),
      mentionRanges: deriveProductMentionRanges(normalizedBody, mentions),
    });
  }, [
    attachmentItems,
    mentions,
    onConnectPersonalAI,
    selectedProvider,
    value,
  ]);

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
        return;
      }

      // An attachment with no text is a valid message, but the design-system
      // composer refuses an empty Enter submit -- send it ourselves so a file
      // can go out on its own. Non-empty text still flows through the composer.
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        value.trim().length === 0 &&
        attachmentItems.some(isReadyComposerAttachment)
      ) {
        event.preventDefault();
        event.stopPropagation();
        void submit(value);
        handleChange("");
      }
    },
    [areAllReady, attachmentItems, getEditor, handleChange, submit, value],
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
  // A send needs either text or a settled attachment to share; every queued
  // attachment must have finished uploading (none still in-flight or failed).
  const hasReadyAttachment = attachmentItems.some(
    isReadyComposerAttachment,
  );
  const canSubmit =
    (value.trim().length > 0 || hasReadyAttachment) &&
    attachmentItems.every(isReadyComposerAttachment);

  // The design-system composer refuses to submit when the text is empty (its
  // handleSubmit early-returns on a blank value), which would block sending an
  // attachment on its own. So the send button and the attachment-only Enter
  // path drive our submit directly, clearing the input exactly as the composer
  // would (onChange(""), matching its internal updateValue("")).
  const sendCurrentMessage = useCallback(() => {
    if (!canSubmit) {
      return;
    }
    void submit(value);
    // Clear through handleChange (not the raw onChange) so the draft-revision
    // counter advances exactly as the composer's own updateValue would --
    // restoreDraftIfUnedited relies on that single increment to recover text
    // when a send fails.
    handleChange("");
  }, [canSubmit, handleChange, submit, value]);

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
            {draftMentionsProductAgent &&
            agentReadiness?.ready === true &&
            readyProviders.length > 1 ? (
              <Selector
                label="Product Agent provider"
                isLabelHidden
                size="sm"
                width="calc(var(--spacing-12) * 2.5)"
                data-testid="agent-provider-picker"
                options={readyProviders.map((candidate) => ({
                  value: candidate.provider,
                  label: PROVIDER_LABEL[candidate.provider],
                }))}
                value={effectiveProvider ?? ""}
                onChange={(next) =>
                  setSelectedProvider(next as Provider)
                }
                htmlName="agentProvider"
                placeholder="Choose a provider"
              />
            ) : null}
            {draftMentionsProductAgent &&
            agentReadiness !== undefined &&
            agentReadiness.ready === false ? (
              <Banner
                status="info"
                title="Connect your AI to reply"
                description="The Product Agent needs a connected provider on your Mac before it can reply in this room."
                data-testid="agent-not-ready"
                endContent={
                  <Button
                    label="Connect personal AI"
                    variant="primary"
                    size="sm"
                    onClick={handleConnectPersonalAI}
                  />
                }
              />
            ) : null}
          </VStack>
        }
        footerActions={
          <HStack gap={1} vAlign="center">
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Add files or images"
              accept={ACCEPTED_ATTACHMENT_FILE_TYPES}
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
            onSend={sendCurrentMessage}
            sendIcon={<Icon icon={ArrowUp} size="md" />}
          />
        }
      />
    </VStack>
  );
}
