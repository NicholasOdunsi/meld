"use client";

import { Button } from "@astryxdesign/core/Button";
import {
  ChatComposer,
  ChatComposerInput,
} from "@astryxdesign/core/Chat";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { CSSProperties } from "react";

const sidebarSurfaceComposerStyle = {
  "--color-background-popover": "var(--color-background-surface)",
} as CSSProperties;

export function DiscoveryComposer({
  value,
  onChange,
  onSubmit,
  status,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  status?: string;
}) {
  return (
    <VStack gap={2}>
      <ChatComposer
        data-testid="discovery-chat-composer"
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        style={sidebarSurfaceComposerStyle}
        placeholder="Ask a question or share a discovery note"
        status={
          status ? { type: "error", message: status } : undefined
        }
        input={
          <ChatComposerInput
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            label="Message"
            placeholder="Ask a question or share a discovery note"
            pasteAsToken={false}
          />
        }
        headerActions={
          <Button
            label="@Product Agent"
            variant="ghost"
            size="sm"
            isDisabled
          />
        }
        headerContext={
          <Text type="supporting">
            Connect personal AI to use the Product Agent
          </Text>
        }
      />
    </VStack>
  );
}
