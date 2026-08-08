"use client";

import { Banner } from "@astryxdesign/core/Banner";
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
  conflictMessage = null,
}: {
  diff: PrdSectionDiff;
  onApply: () => void;
  onDiscard: () => void;
  isBusy?: boolean;
  // Why the last Apply was refused. The server owns staleness -- a proposal
  // carries the base value it was written against, and apply_prd_proposal
  // rechecks it -- so nothing here guesses at whether the section moved. When
  // it says no, the reason stays on the card instead of vanishing with a toast.
  //
  // Apply deliberately stays enabled underneath it. One message covers every
  // reason the call can fail -- a genuinely stale base value, a dropped
  // connection, an expired session -- so disabling on it would strand a
  // perfectly good proposal behind Discard-or-reload whenever the network
  // hiccuped. Nothing unsafe gets through by leaving it: the server rechecks
  // the frozen base value on every attempt and refuses again if it really has
  // moved.
  conflictMessage?: string | null;
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
        {conflictMessage ? (
          <Banner status="warning" title={conflictMessage} />
        ) : null}
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
