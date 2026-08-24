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
}: {
  hasUserFlow: boolean;
  hasPrd: boolean;
  onStart: (instruction: string) => void;
  onFocusComposer: () => void;
}): ReactElement {
  const hasStartingPoint = hasUserFlow || hasPrd;

  return (
    <EmptyState
      title="No screens built yet"
      description={
        hasStartingPoint
          ? "Generate a screen to see the prototype."
          : "Describe a screen in the composer to see the prototype."
      }
      actions={
        hasStartingPoint ? (
          <>
            {hasUserFlow && (
              <Button
                label="Build the first screen from your user flow"
                variant="primary"
                onClick={() =>
                  onStart("generate the first screen based on the userflow")
                }
              />
            )}
            {hasPrd && (
              <Button
                label="Build a screen from your PRD"
                variant={hasUserFlow ? "secondary" : "primary"}
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
