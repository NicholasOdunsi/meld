"use client";

import { Card } from "@astryxdesign/core/Card";
import {
  ChatComposer,
  ChatComposerInput,
  ChatSendButton,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ArrowUp } from "@boxicons/react/ArrowUp";
import type { PrdAssistScopeSection, Provider } from "@meld/contracts";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import {
  DISCOVERY_AGENTS,
  type AgentKind,
} from "@/features/rooms/components/agent-marker";
import type { RoomMentionOption } from "@/features/rooms/components/composer-model";
import { AgentRoutingChip } from "@/features/rooms/components/agent-routing-chip";
import type { AgentRouting } from "@/features/rooms/components/routing-model";
import { useComposerMentions } from "@/features/rooms/components/use-composer-mentions";
import { WaveText } from "@/ui/wave-text";
import { prdAssistOutcome, type PrdAssistOutcome } from "../prd-assist-outcome";
import type { PrdAssistRequest } from "../schemas";
import {
  PRD_ASSIST_THINKING_LABEL,
  PrdAssistResponse,
} from "./prd-assist-response";

// One neutral prompt for every request. There is no Ask/Edit control here by
// design: the user says what they want in their own words and the Product
// Agent decides whether that is a question, a change, or neither yet.
const COMPOSER_PROMPT = "Ask about this or request a change...";

const PRODUCT_AGENT_MENTION: RoomMentionOption = {
  id: DISCOVERY_AGENTS[0].id,
  label: DISCOVERY_AGENTS[0].name,
  handle: "product-agent",
  kind: "product" satisfies AgentKind,
  description: "Answers or revises the selected PRD sections",
};

const sidebarSurfaceComposerStyle = {
  "--color-background-popover": "var(--color-background-surface)",
  "--shadow-low": "none",
  "--shadow-med": "none",
  "--shadow-high": "none",
  boxShadow: "none",
} as CSSProperties;

const composerInputStyle = {
  minBlockSize: "var(--spacing-8)",
  maxBlockSize: "calc(var(--spacing-8) * 2)",
  overflowY: "auto",
} as CSSProperties;

const fullWidthMinZero = {
  minWidth: "var(--spacing-0)",
  maxWidth: "100%",
} as CSSProperties;

// What the request is scoped to, kept small enough that the composer stays a
// popover. One section shows its quote outright; several show a count, their
// labels, and the excerpts behind a disclosure rather than pouring the whole
// selection into the card.
function SelectionScope({ sections }: { sections: PrdAssistScopeSection[] }) {
  if (sections.length === 1) {
    return (
      <HStack
        width="100%"
        vAlign="start"
        style={{
          paddingInlineStart: "var(--spacing-2)",
          minWidth: "var(--spacing-0)",
        }}
      >
        <Text
          color="secondary"
          maxLines={2}
          hasTruncateTooltip={false}
          textWrap="pretty"
          wordBreak="break-word"
          style={fullWidthMinZero}
        >
          “{sections[0].quotedText}”
        </Text>
      </HStack>
    );
  }

  return (
    <VStack
      gap={1}
      width="100%"
      style={{
        paddingInlineStart: "var(--spacing-2)",
        minWidth: "var(--spacing-0)",
      }}
    >
      <Text type="label">{sections.length} sections selected</Text>
      <Text
        color="secondary"
        maxLines={2}
        hasTruncateTooltip={false}
        textWrap="pretty"
        wordBreak="break-word"
        style={fullWidthMinZero}
      >
        {sections.map((section) => section.label).join(" · ")}
      </Text>
      <Collapsible
        defaultIsOpen={false}
        trigger={<Text type="label">View selected text</Text>}
      >
        <VStack gap={2} width="100%" style={fullWidthMinZero}>
          {sections.map((section) => (
            <VStack key={section.field} gap={1} width="100%">
              <Text type="label" color="secondary">
                {section.label}
              </Text>
              <Text
                color="secondary"
                maxLines={3}
                hasTruncateTooltip={false}
                textWrap="pretty"
                wordBreak="break-word"
                style={fullWidthMinZero}
              >
                “{section.quotedText}”
              </Text>
            </VStack>
          ))}
        </VStack>
      </Collapsible>
    </VStack>
  );
}

export function PrdSelectionComposer({
  sections,
  anchor,
  request,
  isSubmitting,
  basePath,
  agentReadiness,
  routing,
  onChoose = () => undefined,
  onSubmit,
  onRetry,
  onClose,
}: {
  sections: PrdAssistScopeSection[];
  anchor: { top: number; left: number };
  // The request this popover submitted, once it exists. Null while composing.
  request: PrdAssistRequest | null;
  // A submission is on its way to the server, or queued but not yet read back.
  isSubmitting: boolean;
  basePath: string;
  agentReadiness?: AgentReadiness;
  routing?: AgentRouting;
  onChoose?: (provider: Provider, model?: string) => void;
  onSubmit: (instruction: string, provider?: Provider, model?: string) => void;
  onRetry: (provider: Provider) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const inputHandleRef = useRef<ChatComposerInputHandle>(null);
  const mentionTrigger = useComposerMentions([PRODUCT_AGENT_MENTION]);

  // One derived state for the whole surface. The outcome is read off the
  // persisted request -- never off what the user typed -- so nothing here can
  // guess at an intent the Product Agent did not actually return.
  const outcome: PrdAssistOutcome | null = isSubmitting
    ? "pending"
    : request
      ? prdAssistOutcome(request)
      : null;

  // Composing, or replying to a clarifying question with the same scope still
  // frozen behind it. An answer or a failure ends the exchange.
  const isReplyable = outcome === null || outcome === "clarification";
  const isInputShown = isReplyable || outcome === "pending";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Focus on open, and again when a clarifying question hands the input back.
  useEffect(() => {
    if (isReplyable) inputHandleRef.current?.focus();
  }, [isReplyable]);

  const mentions = useMemo(() => [mentionTrigger], [mentionTrigger]);
  const canSubmit = isReplyable && value.trim().length > 0;

  function submit(instruction: string) {
    if (!isReplyable) return;
    const normalized = instruction.trim();
    if (!normalized) return;
    setValue("");
    if (routing) {
      onSubmit(normalized, routing.provider, routing.model);
    } else {
      onSubmit(normalized);
    }
  }

  return (
    <Card
      padding={3}
      width="calc(var(--spacing-12) * 9)"
      maxWidth="calc(100% - var(--spacing-8))"
      style={
        {
          "--_card-radius": "var(--radius-chat)",
          position: "absolute",
          top: `${anchor.top}px`,
          left: `max(var(--spacing-4), min(${anchor.left}px, calc(100% - calc(var(--spacing-12) * 9) - var(--spacing-4))))`,
          transform: "translateY(var(--spacing-2))",
          zIndex: 20,
          backgroundColor: "var(--color-background-body)",
          borderColor: "var(--color-border)",
          borderWidth: "var(--border-width)",
          boxShadow: "var(--shadow-low)",
          boxSizing: "border-box",
          maxHeight: "calc(100% - var(--spacing-4))",
          overflow: "auto",
        } as CSSProperties
      }
      onMouseDown={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
      data-testid="prd-selection-composer"
    >
      <VStack gap={3} width="100%">
        <SelectionScope sections={sections} />
        {request ? (
          <PrdAssistResponse
            request={request}
            basePath={basePath}
            onRetry={onRetry}
          />
        ) : isSubmitting ? (
          // Queued but not yet read back. The same label the request's own
          // pending state uses, so the surface does not visibly change when
          // the first poll lands.
          <WaveText
            text={PRD_ASSIST_THINKING_LABEL}
            type="body"
            color="secondary"
          />
        ) : null}
        {isInputShown ? (
          <ChatComposer
            density="compact"
            value={value}
            onChange={setValue}
            onSubmit={submit}
            isDisabled={!isReplyable}
            style={sidebarSurfaceComposerStyle}
            placeholder={COMPOSER_PROMPT}
            sendButton={
              <ChatSendButton
                isDisabled={!canSubmit}
                onSend={() => submit(value)}
                sendIcon={<Icon icon={ArrowUp} size="md" />}
              />
            }
            sendActions={
              <AgentRoutingChip
                readiness={agentReadiness}
                routing={routing}
                isAgentAddressed
                onChoose={onChoose}
                onConnect={() => undefined}
              />
            }
            input={
              <ChatComposerInput
                handleRef={inputHandleRef}
                value={value}
                onChange={setValue}
                onSubmit={submit}
                isDisabled={!isReplyable}
                triggers={mentions}
                label={COMPOSER_PROMPT}
                placeholder={COMPOSER_PROMPT}
                maxRows={2}
                pasteAsToken={false}
                style={composerInputStyle}
              />
            }
          />
        ) : null}
      </VStack>
    </Card>
  );
}
