"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import type { TasteSignalReason } from "@meld/contracts";
import { dismissRedoFeedback, useRedoFeedback } from "../taste/redo-feedback-store";
import { recordTasteSignal } from "../taste/taste-actions";

const REASONS: { reason: TasteSignalReason; label: string }[] = [
  { reason: "too_plain", label: "Too plain" },
  { reason: "too_busy", label: "Too busy" },
  { reason: "wrong_colours", label: "Wrong colours" },
  { reason: "wrong_layout", label: "Wrong layout" },
  { reason: "not_my_style", label: "Not my style" },
];

export function RedoFeedbackRow() {
  const request = useRedoFeedback();
  if (!request) return null;
  return (
    <HStack gap={2} wrap="wrap" vAlign="center" data-testid="redo-feedback">
      <Text type="supporting">What was off?</Text>
      {REASONS.map(({ reason, label }) => (
        <Button
          key={reason}
          label={label}
          size="sm"
          onClick={() => {
            dismissRedoFeedback();
            void recordTasteSignal({ screenId: request.screenId, reason });
          }}
        />
      ))}
      <Button label="Skip" size="sm" variant="ghost" onClick={dismissRedoFeedback} />
    </HStack>
  );
}
