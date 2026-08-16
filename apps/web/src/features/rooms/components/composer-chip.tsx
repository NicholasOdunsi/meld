"use client";

import { Button } from "@astryxdesign/core/Button";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import type { ReactNode } from "react";

// The chip's three tones map onto Button variants rather than custom colour, so
// the whole control is themed by the design system and the repo's no-literal-
// colour check has nothing to inspect.
//
//   rest    -- the agent is not addressed in this draft. A quiet statement of
//              fact ("if you call an agent, this answers"). Still clickable.
//   active  -- the draft addresses an agent; the chip gains weight.
//   warning -- nothing is connected; paired with words, never colour alone.
export type ComposerChipTone = "rest" | "active" | "warning";

const TONE_VARIANT = {
  rest: "ghost",
  active: "ghost",
  warning: "ghost",
} as const;

const CHIP_MENU_WIDTH = "calc(var(--spacing-12) * 3)";

export function ComposerChip({
  label,
  tone,
  menuLabel,
  testId,
  isInert = false,
  buttonContent,
  children,
}: {
  label: string;
  tone: ComposerChipTone;
  // Prefixes the button's accessible name so the chip announces what the value
  // means, not just the value: "AI provider: Claude".
  menuLabel: string;
  testId: string;
  // Readiness has not resolved yet. The chip must claim no provider and must
  // not open a menu over a set we do not know.
  isInert?: boolean;
  // Visible content for the button. The label remains the accessible name.
  buttonContent?: ReactNode;
  children?: ReactNode;
}) {
  const accessibleName = `${menuLabel}: ${label}`;

  if (isInert) {
    return (
      <Button
        label={accessibleName}
        variant={TONE_VARIANT[tone]}
        size="sm"
        isDisabled
        data-testid={testId}
      >
        {buttonContent}
      </Button>
    );
  }

  return (
    <DropdownMenu
      data-testid={testId}
      hasChevron
      menuWidth={CHIP_MENU_WIDTH}
      button={{
        label: accessibleName,
        variant: TONE_VARIANT[tone],
        size: "sm",
        children: buttonContent,
      }}
    >
      {children}
    </DropdownMenu>
  );
}
