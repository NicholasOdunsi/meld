"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { PrdSectionDiff } from "../prd-section-diff";
import { sectionDiffLines } from "../prd-section-diff";

export function PrdProposalCard({
  diff,
  onApply,
  onDiscard,
  isBusy = false,
}: {
  diff: PrdSectionDiff;
  onApply: () => void;
  onDiscard: () => void;
  isBusy?: boolean;
}) {
  return (
    <Card
      variant="muted"
      padding={3}
      width="100%"
      data-testid="prd-proposal-card"
    >
      <VStack gap={3} width="100%">
        <VStack gap={2} width="100%">
          <Text type="label">Product Agent suggestion</Text>
          {sectionDiffLines(diff)
            .filter((line) => line.status === "added")
            .map((line) => (
              <Text
                key={`${line.status}-${line.value}`}
                style={{ color: "var(--color-text-green)" }}
              >
                {line.value}
              </Text>
            ))}
        </VStack>
        <HStack gap={2} wrap="wrap">
          <Button
            label="Apply changes"
            variant="primary"
            isLoading={isBusy}
            isDisabled={isBusy}
            onClick={onApply}
          />
          <Button
            label="Discard"
            variant="secondary"
            isDisabled={isBusy}
            onClick={onDiscard}
          />
        </HStack>
      </VStack>
    </Card>
  );
}
