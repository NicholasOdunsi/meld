"use client";

import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import type { ReactElement } from "react";

// Rendered only when the prototype tab has nothing to show. This component
// never calls a server action itself -- it hands the exact instruction
// string to `onStart` (Task 9 wires that to real generation) or, when there
// is nothing specific to build from yet, hands off to `onFocusComposer` so
// the person lands somewhere that can still start something.
export function PrototypeEmptyState({
  hasUserFlow,
  hasPrd,
  onStart,
  onFocusComposer,
  isStarting = false,
}: {
  hasUserFlow: boolean;
  hasPrd: boolean;
  onStart: (instruction: string) => void;
  onFocusComposer: () => void;
  /**
   * Set once a starting point has been clicked and generation is queued but
   * not yet built. Without this, the buttons acknowledge nothing: the click
   * appears to do nothing for the 30-60s generation actually takes, and a
   * second click in that window queues a second generation.
   */
  isStarting?: boolean;
}): ReactElement {
  const hasStartingPoint = hasUserFlow || hasPrd;

  return (
    <EmptyState
      title="No screens built yet"
      description={
        hasStartingPoint
          ? isStarting
            ? "Generating your first screen…"
            : "Generate a screen to see the prototype."
          : "Describe a screen in the composer to see the prototype."
      }
      actions={
        hasStartingPoint ? (
          <>
            {hasUserFlow && (
              <Button
                label="Build the first screen from your user flow"
                variant="primary"
                isLoading={isStarting}
                onClick={() =>
                  onStart("generate the first screen based on the userflow")
                }
              />
            )}
            {hasPrd && (
              <Button
                label="Build a screen from your PRD"
                variant={hasUserFlow ? "secondary" : "primary"}
                isLoading={isStarting}
                onClick={() => onStart("generate the first screen based on the PRD")}
              />
            )}
          </>
        ) : (
          <Button label="Describe a screen" variant="primary" onClick={onFocusComposer} />
        )
      }
    />
  );
}
