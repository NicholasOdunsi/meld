"use client";

import { Card } from "@astryxdesign/core/Card";
import {
  ChatComposer,
  ChatComposerInput,
  ChatSendButton,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ArrowUp } from "@boxicons/react/ArrowUp";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DISCOVERY_AGENTS,
  type AgentKind,
} from "../../discovery/components/agent-marker";
import type { DiscoveryMentionOption } from "../../discovery/components/composer-model";
import { useComposerMentions } from "../../discovery/components/use-composer-mentions";
import type { PrdSelection } from "../prd-selection";

const PRODUCT_AGENT_MENTION: DiscoveryMentionOption = {
  id: DISCOVERY_AGENTS[0].id,
  label: DISCOVERY_AGENTS[0].name,
  handle: "product-agent",
  kind: "product" satisfies AgentKind,
  description: "Revises only the selected PRD section",
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

export function PrdSelectionComposer({
  selection,
  anchor,
  onAsk,
  onClose,
}: {
  selection: PrdSelection;
  anchor: { top: number; left: number };
  onAsk: (instruction: string, selection: PrdSelection) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const inputHandleRef = useRef<ChatComposerInputHandle>(null);
  const mentionTrigger = useComposerMentions([PRODUCT_AGENT_MENTION]);

  useEffect(() => {
    inputHandleRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const mentions = useMemo(() => [mentionTrigger], [mentionTrigger]);
  const canSubmit = value.trim().length > 0;

  function submit(instruction: string) {
    const normalized = instruction.trim();
    if (!normalized) return;
    onAsk(normalized, selection);
  }

  return (
    <Card
      padding={3}
      width="calc(var(--spacing-12) * 9)"
      maxWidth="calc(100vw - var(--spacing-8))"
      style={
        {
          "--_card-radius": "var(--radius-chat)",
          position: "fixed",
          top: `min(${anchor.top}px, calc(100vh - calc(var(--spacing-12) * 4)))`,
          left: `max(var(--spacing-4), min(${anchor.left}px, calc(100vw - calc(var(--spacing-12) * 9) - var(--spacing-4))))`,
          transform: "translateY(var(--spacing-2))",
          zIndex: 20,
          backgroundColor: "var(--color-background-body)",
          borderColor: "var(--color-border)",
          borderWidth: "var(--border-width)",
          boxShadow: "var(--shadow-low)",
          boxSizing: "border-box",
          maxHeight: "calc(100vh - var(--spacing-4))",
          overflow: "auto",
        } as CSSProperties
      }
      onMouseDown={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
      data-testid="prd-selection-composer"
    >
      <VStack gap={3} width="100%">
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
            style={{ minWidth: "var(--spacing-0)", maxWidth: "100%" }}
          >
            “{selection.quotedText}”
          </Text>
        </HStack>
        <ChatComposer
          density="compact"
          value={value}
          onChange={setValue}
          onSubmit={submit}
          style={sidebarSurfaceComposerStyle}
          placeholder="Ask the Product Agent to change this section…"
          sendButton={
            <ChatSendButton
              isDisabled={!canSubmit}
              onSend={() => submit(value)}
              sendIcon={<Icon icon={ArrowUp} size="md" />}
            />
          }
          input={
            <ChatComposerInput
              handleRef={inputHandleRef}
              value={value}
              onChange={setValue}
              onSubmit={submit}
              triggers={mentions}
              label="Ask the Product Agent"
              placeholder="Ask the Product Agent to change this section…"
              maxRows={2}
              pasteAsToken={false}
              style={composerInputStyle}
            />
          }
        />
      </VStack>
    </Card>
  );
}
