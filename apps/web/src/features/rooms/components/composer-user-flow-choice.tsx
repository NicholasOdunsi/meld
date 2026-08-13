"use client";

import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { PixelX as X } from "@/ui/pixel-icons";
import { useCallback, useEffect, useRef, useState } from "react";

// The one fork among the room starters: mapping a user flow first asks how the
// flow should get built. It renders in the composer's dock -- standing in for
// the text input rather than floating above it -- so the wording and option
// labels live here next to the card that shows them.
export const USER_FLOW_CHOICE_QUESTION =
  "Map this out yourself, or have an agent take a first pass?";
const MANUAL_OPTION_LABEL = "Map it myself";
const AGENT_OPTION_LABEL = "Let the agent do it";

// The option number doubles as its keyboard shortcut, so it reads as a dim
// prefix rather than part of the label. A fixed inline-size keeps the two
// labels left-aligned regardless of digit width.
function OptionNumber({ value }: { value: number }) {
  return (
    <Text type="body" color="secondary" style={{ inlineSize: "var(--spacing-3)" }}>
      {value}
    </Text>
  );
}

export function ComposerUserFlowChoice({
  onSelectManual,
  onSelectAgent,
  onDismiss,
}: {
  // Starts a blank User Flows canvas. May navigate away (unmounting this card)
  // on success or leave it to the parent to dismiss on failure.
  onSelectManual: () => Promise<void> | void;
  // Hands the flow to the Product Agent by pre-filling the composer.
  onSelectAgent: () => void;
  // Backs out to the starter prompts.
  onDismiss: () => void;
}) {
  const [isStarting, setIsStarting] = useState(false);
  // Guards the manual start against a double-trigger (click + number key)
  // without waiting on the isStarting state to commit.
  const isStartingRef = useRef(false);

  const startManual = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setIsStarting(true);
    try {
      await onSelectManual();
    } finally {
      isStartingRef.current = false;
      setIsStarting(false);
    }
  }, [onSelectManual]);

  // With the text input replaced by this card there is nothing to type into,
  // so the numbers labelling each option double as shortcuts and Escape backs
  // out the same way the close button does.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "1") {
        event.preventDefault();
        void startManual();
      } else if (event.key === "2") {
        event.preventDefault();
        onSelectAgent();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [startManual, onSelectAgent, onDismiss]);

  return (
    // Standing in for the composer's text input, this mirrors the composer's
    // own elevated surface so swapping it in doesn't read as the composer
    // background disappearing. The composer remaps its popover background to
    // --color-background-surface (see sidebarSurfaceComposerStyle in
    // composer.tsx), so match that token rather than the raw popover one.
    <VStack
      gap={1}
      width="100%"
      data-testid="composer-user-flow-choice"
      style={{
        backgroundColor: "var(--color-background-surface)",
        borderRadius: "var(--radius-chat)",
        boxShadow: "var(--shadow-low)",
        padding: "var(--spacing-3)",
      }}
    >
      <HStack width="100%" hAlign="between" vAlign="start" gap={2}>
        <Text type="label">{USER_FLOW_CHOICE_QUESTION}</Text>
        <IconButton
          label="Dismiss"
          tooltip="Dismiss"
          icon={<Icon icon={X} size="sm" />}
          variant="ghost"
          size="sm"
          onClick={onDismiss}
        />
      </HStack>
      <List density="compact">
        <ListItem
          startContent={<OptionNumber value={1} />}
          label={MANUAL_OPTION_LABEL}
          isDisabled={isStarting}
          onClick={() => void startManual()}
        />
        <ListItem
          startContent={<OptionNumber value={2} />}
          label={AGENT_OPTION_LABEL}
          onClick={onSelectAgent}
        />
      </List>
    </VStack>
  );
}
