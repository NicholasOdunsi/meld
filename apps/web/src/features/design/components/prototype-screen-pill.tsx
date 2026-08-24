"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Center } from "@astryxdesign/core/Center";
import { DropdownMenu, DropdownMenuItem } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import type { ReactElement } from "react";
import type { PrototypeScreenSummary } from "@/features/design/prototype-reader";

// A screen can be deleted out from under the pane while it is on screen (an
// agent edit, another tab). The trigger must never blank or crash -- it
// falls back to naming the control itself rather than the missing screen.
const NEUTRAL_LABEL = "Screens";

const MENU_WIDTH = "calc(var(--spacing-12) * 4)";

function thumbnailRatio(formFactor: PrototypeScreenSummary["formFactor"]): number {
  // formFactor only shapes the decorative thumbnail; it is unrelated to the
  // separate viewport toggle and never filters which screens are listed.
  return formFactor === "mobile" ? 9 / 16 : 16 / 10;
}

function ScreenThumbnail({
  formFactor,
}: {
  formFactor: PrototypeScreenSummary["formFactor"];
}) {
  return (
    <AspectRatio
      ratio={thumbnailRatio(formFactor)}
      style={{
        width: "var(--spacing-9)",
        backgroundColor: "var(--meld-surface-sunken)",
        borderRadius: "var(--meld-radius-sm)",
      }}
    >
      {/* Decorative -- thumbnails stand in for the screen, they do not render it. */}
      <Center width="100%" height="100%" aria-hidden="true">
        {null}
      </Center>
    </AspectRatio>
  );
}

// Replaces the raw <select> that used to sit unstyled on top of a generated
// prototype. Positioning is entirely the caller's job -- this component never
// paints `position: absolute` itself.
export function PrototypeScreenPill({
  screens,
  selectedId,
  onSelect,
}: {
  screens: PrototypeScreenSummary[];
  selectedId: string;
  onSelect: (screenId: string) => void;
}): ReactElement | null {
  // A switcher that cannot switch is furniture sitting in front of the
  // design -- render nothing rather than a control with nowhere to go.
  if (screens.length < 2) {
    return null;
  }

  const selectedIndex = screens.findIndex((screen) => screen.id === selectedId);
  const selected = selectedIndex === -1 ? undefined : screens[selectedIndex];
  const triggerLabel = selected
    ? `${selected.name} (${selectedIndex + 1} of ${screens.length})`
    : NEUTRAL_LABEL;

  return (
    <DropdownMenu
      data-testid="prototype-screen-pill"
      menuWidth={MENU_WIDTH}
      button={{ label: triggerLabel, variant: "ghost", size: "sm" }}
    >
      {screens.map((screen) => (
        <DropdownMenuItem
          key={screen.id}
          label={
            <HStack gap={2} vAlign="center">
              <ScreenThumbnail formFactor={screen.formFactor} />
              <Text type="body">{screen.name}</Text>
            </HStack>
          }
          onClick={() => onSelect(screen.id)}
        />
      ))}
    </DropdownMenu>
  );
}
