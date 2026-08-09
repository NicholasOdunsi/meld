"use client";

import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { CSSProperties } from "react";
import { sectionDiffLines } from "@/features/prd/prd-section-diff";
import type { DiscoveryMessage } from "../repository";
import { PrdContextRow, prdSectionKind } from "./prd-context-row";

const fullWidthMinZero = {
  minWidth: "var(--spacing-0)",
  maxWidth: "100%",
} as CSSProperties;

const DIFF_LINE_LABEL = {
  removed: "Before",
  added: "After",
} as const;

const DIFF_LINE_COLOR = {
  removed: { color: "var(--color-text-red)" } as CSSProperties,
  added: { color: "var(--color-text-green)" } as CSSProperties,
};

// Applied edits continue the Product Agent's work without repeating its
// avatar. The offset plus card padding aligns the event copy with agent text.
const assistantContinuationStyle = {
  marginInlineStart: "var(--spacing-8)",
} as CSSProperties;

// An applied edit is an event in the room's record, not something the Product
// Agent said: it renders as one compact line with its frozen context, never as
// a chat bubble. The instruction and the two values live on the linked
// proposal, so the disclosure appears only once that proposal has been read
// (the query path embeds it; a Realtime INSERT does not carry it).
export function PrdChangeEvent({
  message,
  time,
  basePath,
}: {
  message: DiscoveryMessage;
  time: string;
  basePath?: string;
}) {
  const context = message.prdContext;
  const change = message.prdChange;
  const diffLines = change
    ? sectionDiffLines({
        kind: prdSectionKind(context?.sections[0]?.field ?? ""),
        before: change.previousValue,
        after: change.proposedValue,
      })
    : [];

  return (
    <Card
      variant="muted"
      padding={2}
      width="calc(100% - var(--spacing-8))"
      id={`message-${message.id}`}
      data-testid="prd-change-event"
      style={assistantContinuationStyle}
    >
      <VStack gap={1} width="100%" style={fullWidthMinZero}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text type="label">{message.body}</Text>
          <Text type="supporting">{time}</Text>
        </HStack>

        {context ? (
          <PrdContextRow context={context} basePath={basePath} />
        ) : null}

        {change ? (
          <Collapsible
            defaultIsOpen={false}
            trigger={<Text type="label">Instruction and change</Text>}
          >
            <VStack gap={1} width="100%" style={fullWidthMinZero}>
              <Text
                color="secondary"
                textWrap="pretty"
                wordBreak="break-word"
                style={fullWidthMinZero}
              >
                “{change.instruction}”
              </Text>
              {diffLines.map((line) => (
                <VStack
                  key={line.status}
                  gap={0.5}
                  width="100%"
                  style={fullWidthMinZero}
                >
                  {/* Labelled, not colour-coded: the colour is decoration. */}
                  <Text type="label" color="secondary">
                    {DIFF_LINE_LABEL[line.status]}
                  </Text>
                  <Text
                    textWrap="pretty"
                    wordBreak="break-word"
                    style={{
                      ...fullWidthMinZero,
                      ...DIFF_LINE_COLOR[line.status],
                    }}
                  >
                    {line.value}
                  </Text>
                </VStack>
              ))}
            </VStack>
          </Collapsible>
        ) : null}
      </VStack>
    </Card>
  );
}
