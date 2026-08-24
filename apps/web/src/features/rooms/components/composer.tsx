"use client";

import {
  ChatComposer,
  ChatComposerInput,
} from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { VStack } from "@astryxdesign/core/VStack";
import {
  PixelAt as At,
  PixelPlus as Plus,
  PixelX as X,
} from "@/ui/pixel-icons";
import type { Provider, ResearchScope } from "@meld/contracts";
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { ACCEPTED_ATTACHMENT_FILE_TYPES } from "../attachment-mime";
import type { RoomAttachmentView } from "../attachment-types";
import { MeldFieldFrame } from "@/ui/meld/field-frame";
import { useTypewriter } from "@/ui/meld/use-typewriter";
import { MeldSendButton } from "@/ui/meld/send-button";
import { DesignSystemPrompt } from "@/features/design/components/design-system-prompt";
import { AgentRoutingChip } from "./agent-routing-chip";
import { RoomComposerAttachments } from "./composer-attachments";
import { ComposerAgentPeek } from "./composer-agent-peek";
import { COMPOSER_FORMAT_ACTIONS } from "./composer-format-actions";
import {
  deriveMentionSubmission,
  deriveProductMentionRanges,
  isReadyComposerAttachment,
  type RoomComposerSubmission,
  type RoomMentionOption,
  type QueuedRoomAttachment,
  type RoomDraft,
} from "./composer-model";
import { removeMentionBeforeCaret } from "./editor-selection";
import { ResearchScopeChip } from "./research-scope-chip";
import { useRoomRouting } from "./use-room-routing";
import { useComposerAttachments } from "./use-composer-attachments";
import { useComposerEditor } from "./use-composer-editor";
import { useComposerMentions } from "./use-composer-mentions";
import { useRoomComposerContext } from "./room-composer-context";
import type { RoomComposerPrdSelection } from "./room-composer-context";

// The Meld frame wrapped around this composer draws the edge (see
// `MeldFieldFrame`), so Astryx's own container has to stand down completely --
// its radius, its border and its hover/focus shadows would otherwise be a
// second edge inside the first. `--_chat-composer-radius` is the documented
// hook for the corner; the rest is flattened directly.
const sidebarSurfaceComposerStyle = {
  "--color-background-popover": "var(--color-background-surface)",
  "--_chat-composer-radius": "0px",
  position: "relative",
  zIndex: 1,
  background: "transparent",
  border: "0",
  boxShadow: "none",
} as CSSProperties;

const composerShellStyle = {
  position: "relative",
} as CSSProperties;

const composerInputStyle = {
  minBlockSize: "var(--spacing-8)",
} as CSSProperties;

// Examples of what the composer can do -- an empty room otherwise gives no
// hint that @-mentioning an agent is the way in.
const COMPOSER_PLACEHOLDER_PROMPTS = [
  "Ask a question or share a room note",
  "@Product Agent create a PRD",
  "@Research Agent find relevant research",
  "@Product Agent what should we prioritize next?",
  "Share an observation from your last user interview",
];

export function withPrdSelectionContext(
  body: string,
  selection: RoomComposerPrdSelection | null,
): string {
  if (!selection) return body;
  const quote = [
    `Attached document selection from "${selection.label}". Apply this request only to this selection unless the request explicitly asks for a broader edit.`,
    "",
    selection.quotedText,
  ]
    .join("\n")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `${body}\n\n${quote}`;
}

export function RoomComposer({
  value,
  onChange,
  onSubmit,
  onStageAttachment,
  onDiscardStagedAttachment,
  onStagedAttachmentCountChange,
  mentions,
  status,
  agentReadiness,
  onConnectPersonalAI,
  roomId,
  initialProviderOverride,
  initialModelOverride,
  initialResearchScope,
  onFocusWithin,
  isIntegrated = false,
}: {
  roomId: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (submission: RoomComposerSubmission) => Promise<boolean>;
  onStageAttachment?: (
    attachment: QueuedRoomAttachment,
  ) => Promise<RoomAttachmentView>;
  onDiscardStagedAttachment?: (attachmentId: string) => Promise<void>;
  /**
   * Reports how many attachments are currently staged (queued, uploading, or
   * uploaded) whenever that count changes. This describes the composer's own
   * state, not what a caller should do with it -- a caller like the Room dock
   * uses it to decide whether it is safe to collapse, but that policy is the
   * caller's, not the composer's.
   */
  onStagedAttachmentCountChange?: (count: number) => void;
  mentions: readonly RoomMentionOption[];
  status?: string;
  // Undefined while readiness is still loading; a Product Agent mention cannot
  // be sent until this resolves ready.
  agentReadiness?: AgentReadiness;
  // Invoked instead of submitting when a Product Agent mention has no ready
  // provider: the caller persists the draft and routes to AI setup.
  onConnectPersonalAI?: (draft: RoomDraft) => void;
  initialProviderOverride?: Provider;
  initialModelOverride?: string;
  initialResearchScope?: ResearchScope;
  /** Fired when focus lands anywhere inside the composer. React's `onFocus`
   * is `focusin`, so it bubbles from the editor and every toolbar control --
   * which is what the Room wants: reaching for the composer at all is the
   * signal, not typing into it. */
  onFocusWithin?: () => void;
  /** Flattens the field frame when the expanded dock supplies the shared edge. */
  isIntegrated?: boolean;
}) {
  const [isFormattingOpen, setIsFormattingOpen] = useState(false);
  const [researchScope, setResearchScope] = useState<ResearchScope>(
    initialResearchScope ?? "room",
  );
  const roomComposer = useRoomComposerContext();
  const prdSelection = roomComposer?.prdSelection ?? null;
  const canvasSelection = roomComposer?.canvasSelection ?? [];
  const canvasScreenNames = roomComposer?.canvasScreenNames ?? new Map<string, string>();
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

  const draftAgentKinds = useMemo(
    () => deriveMentionSubmission(value, mentions).mentionedAgentKinds,
    [value, mentions],
  );
  const draftAgentKind =
    draftAgentKinds.length === 1
      ? draftAgentKinds[0]
      : prdSelection
        ? "product"
        : undefined;
  const hasMultipleAgentMentions = draftAgentKinds.length > 1;

  const { routing: effectiveRouting, choose } = useRoomRouting({
    roomId,
    readiness: agentReadiness,
    initialProviderOverride,
    initialModelOverride,
  });
  const effectiveProvider = effectiveRouting?.provider;
  const effectiveModel = effectiveRouting?.model;

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
      if (mention.mentionedAgentKinds.length > 1) {
        return;
      }
      const agentKind = mention.mentionedAgentKinds[0];
      const routedAgentKind = agentKind ?? (prdSelection ? "product" : undefined);
      const mentionsProductAgent = routedAgentKind === "product";

      // Readiness preflight: a Product Agent mention with no ready provider is
      // never submitted. The full draft is handed off (body, semantic mention
      // ranges, provider, staged attachment ids) and the composer keeps its
      // contents -- nothing is reserved, cleared, or sent.
      if (routedAgentKind && agentReadiness?.ready !== true) {
        onConnectPersonalAI?.({
          body: withPrdSelectionContext(normalizedBody, prdSelection),
          providerOverride: effectiveProvider,
          modelOverride: effectiveModel,
          researchScope:
            routedAgentKind === "research" ? researchScope : undefined,
          attachmentIds: attachmentItems
            .filter(isReadyComposerAttachment)
            .map((attachment) => attachment.uploaded.id),
          mentionRanges: deriveProductMentionRanges(
            normalizedBody,
            mentions,
            routedAgentKind,
          ),
        });
        return;
      }

      const submittedRevision = beginDraftSubmission();
      const reserved = beginSubmission();
      const submission: RoomComposerSubmission = {
        body: withPrdSelectionContext(normalizedBody, prdSelection),
        attachments: reserved,
        ...mention,
        mentionsProductAgent,
        agentKind: routedAgentKind,
        researchScope:
          routedAgentKind === "research" ? researchScope : undefined,
        providerOverride: routedAgentKind ? effectiveProvider : undefined,
        modelOverride: routedAgentKind ? effectiveModel : undefined,
      };

      try {
        const didSubmit = await onSubmit(submission);
        if (!didSubmit) {
          cancelSubmission(reserved);
          restoreDraftIfUnedited(submittedRevision, normalizedBody);
          return;
        }
        completeSubmission(reserved);
        roomComposer?.clearPrdSelection();
      } catch {
        cancelSubmission(reserved);
        restoreDraftIfUnedited(submittedRevision, normalizedBody);
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
      effectiveModel,
      mentions,
      onConnectPersonalAI,
      onSubmit,
      prdSelection,
      restoreDraftIfUnedited,
      researchScope,
      roomComposer,
    ],
  );

  useEffect(() => {
    if (!prdSelection) return;
    onFocusWithin?.();
    const frame = window.requestAnimationFrame(() => {
      inputHandleRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onFocusWithin, prdSelection]);

  useEffect(() => {
    onStagedAttachmentCountChange?.(attachmentItems.length);
  }, [attachmentItems, onStagedAttachmentCountChange]);

  const handleConnectPersonalAI = useCallback(() => {
    const normalizedBody = value.trim();
    onConnectPersonalAI?.({
      body: normalizedBody,
      providerOverride: effectiveProvider,
      modelOverride: effectiveModel,
      researchScope: draftAgentKind === "research" ? researchScope : undefined,
      attachmentIds: attachmentItems
        .filter(isReadyComposerAttachment)
        .map((attachment) => attachment.uploaded.id),
      mentionRanges: deriveProductMentionRanges(
        normalizedBody,
        mentions,
        draftAgentKind,
      ),
    });
  }, [
    attachmentItems,
    draftAgentKind,
    mentions,
    onConnectPersonalAI,
    researchScope,
    effectiveProvider,
    effectiveModel,
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
      if (event.key === "Enter" && !event.shiftKey && !areAllReady()) {
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
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const failedAttachment = attachmentItems.find(
    (attachment) => attachment.status === "failed",
  );
  const visibleStatus =
    (hasMultipleAgentMentions ? "Mention one agent at a time." : undefined) ??
    attachmentError ??
    (failedAttachment?.status === "failed"
      ? `${failedAttachment.file.name}: ${failedAttachment.error}`
      : status);
  // A send needs either text or a settled attachment to share; every queued
  // attachment must have finished uploading (none still in-flight or failed).
  const hasReadyAttachment = attachmentItems.some(isReadyComposerAttachment);
  const canSubmit =
    (value.trim().length > 0 || hasReadyAttachment) &&
    attachmentItems.every(isReadyComposerAttachment) &&
    !hasMultipleAgentMentions;
  // The same typewriter the workspace console uses, and literally the same
  // hook -- a shared cadence rather than a second implementation that drifts.
  // It pauses itself while there is a draft (the placeholder is hidden then
  // anyway) and holds still entirely for a reader who asked for less motion.
  const rotatingPlaceholder = useTypewriter({
    phrases: COMPOSER_PLACEHOLDER_PROMPTS,
    isPaused: value !== "",
  });

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
    <VStack gap={2} style={composerShellStyle} onFocus={onFocusWithin}>
      {/* Addressing the Design Agent is the moment a missing design system
          starts to cost something -- every generated screen re-decides its own
          look. Say so here, where the ask is being written, and offer the
          upload in place. */}
      <DesignSystemPrompt roomId={roomId} isActive={draftAgentKind === "design"} />
      {draftAgentKind ? <ComposerAgentPeek kind={draftAgentKind} /> : null}
      <MeldFieldFrame isIntegrated={isIntegrated}>
      <ChatComposer
        data-testid="room-chat-composer"
        density="compact"
        value={value}
        onChange={handleChange}
        onSubmit={submit}
        style={sidebarSurfaceComposerStyle}
        placeholder={rotatingPlaceholder}
        status={
          visibleStatus ? { type: "error", message: visibleStatus } : undefined
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
            {/* What the Canvas currently has selected. Without this the only
                signal that a request will edit rather than create was the
                result -- you found out after generating. Mirrors the chips the
                Canvas composer showed before it was folded into this one. */}
            {canvasSelection.length > 0 ? (
              <HStack gap={0.5} wrap="wrap" data-testid="composer-canvas-selection">
                {canvasSelection.map((target, index) => (
                  <Token
                    key={target.targetScreenId ?? `new-screen-${index}`}
                    size="sm"
                    label={
                      target.targetScreenId === null
                        ? "New screen"
                        : canvasScreenNames.get(target.targetScreenId) ?? "Screen"
                    }
                    endContent={
                      target.sketchShapes.length > 0 ? (
                        <Text type="supporting">
                          {`· following your sketch (${target.sketchShapes.length})`}
                        </Text>
                      ) : undefined
                    }
                  />
                ))}
              </HStack>
            ) : null}
            {prdSelection ? (
              <HStack
                width="100%"
                vAlign="start"
                gap={2}
                style={{
                  minWidth: "var(--spacing-0)",
                  padding: "var(--spacing-1) var(--spacing-2)",
                  borderInlineStart:
                    "var(--spacing-0-5) solid var(--color-border-strong)",
                }}
              >
                <Text
                  color="secondary"
                  maxLines={2}
                  hasTruncateTooltip={false}
                  textWrap="pretty"
                  wordBreak="break-word"
                  style={{ minWidth: "var(--spacing-0)", flex: 1 }}
                >
                  {prdSelection.label}: {prdSelection.quotedText}
                </Text>
                <IconButton
                  label="Remove selected document text"
                  tooltip="Remove"
                  icon={<X pack="basic" size="sm" />}
                  variant="ghost"
                  size="sm"
                  onClick={() => roomComposer?.clearPrdSelection()}
                />
              </HStack>
            ) : null}
            <RoomComposerAttachments
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
              placeholder={rotatingPlaceholder}
              maxRows={isFormattingOpen ? 12 : 8}
              pasteAsToken={false}
              style={composerInputStyle}
            />
            {draftAgentKind && agentReadiness?.ready === false ? (
              <Text
                type="supporting"
                color="secondary"
                role="status"
                data-testid="agent-not-ready"
              >
                No AI connected - press Send to connect yours and keep this
                draft.
              </Text>
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
        sendActions={
          <HStack gap={1} vAlign="center">
            {draftAgentKind === "research" ? (
              <ResearchScopeChip
                scope={researchScope}
                onChange={setResearchScope}
              />
            ) : null}
            <AgentRoutingChip
              readiness={agentReadiness}
              routing={effectiveRouting}
              isAgentAddressed={draftAgentKind !== undefined}
              onChoose={choose}
              onConnect={handleConnectPersonalAI}
            />
          </HStack>
        }
        sendButton={
          <MeldSendButton
            isDisabled={!canSubmit}
            onSend={sendCurrentMessage}
          />
        }
      />
      </MeldFieldFrame>
    </VStack>
  );
}
