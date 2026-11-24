"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { StopReason } from "./live-state";

// Replaces a live frame that hung or crashed. The frame is unmounted, so its
// timers stop too. Excalidraw disables pointer events on embeddables that are
// not "active", so the overlay turns them back on for its buttons.
export function StoppedOverlay({ reason, detail, onReload, onShowCode }: {
  reason: StopReason;
  detail: string | null;
  onReload: () => void;
  onShowCode?: () => void;
}) {
  const crashed = reason === "crashed";
  return (
    <VStack
      role="alert"
      height="100%"
      justify="center"
      align="center"
      gap={2}
      padding={4}
      style={{ pointerEvents: "auto", background: "var(--color-background-surface)" }}
    >
      <Text type="label">{crashed ? "This screen hit an error" : "This screen stopped responding"}</Text>
      {crashed && detail ? <Text type="supporting" maxLines={3}>{detail}</Text> : null}
      <HStack gap={2}>
        <Button label="Reload" size="sm" variant="primary" onClick={onReload} />
        {onShowCode ? <Button label="Show code" size="sm" variant="ghost" onClick={onShowCode} /> : null}
      </HStack>
    </VStack>
  );
}
