"use client";

import { ToggleButton, ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";
import type { ReactElement } from "react";

export type PrototypeViewport = "desktop" | "mobile";

// Generated screens already ship a `@media (max-width: 960px)` breakpoint, so
// narrowing the prototype frame to a phone width makes that breakpoint
// apply for real. This is the single source for that width -- the viewer
// (Task 7) reads this constant rather than repeating the number.
export const MOBILE_VIEWPORT_WIDTH_PX = 390;

// Preview only. This toggle previews a screen at desktop or phone width; it
// does not generate anything, does not filter which screens are listed, and
// has nothing to do with a screen's own `formFactor` (what it was designed
// for). Positioning is entirely the caller's job -- this component never
// paints `position: absolute` itself.
export function PrototypeViewportToggle({
  value,
  onChange,
}: {
  value: PrototypeViewport;
  onChange: (value: PrototypeViewport) => void;
}): ReactElement {
  return (
    <ToggleButtonGroup
      label="Preview viewport"
      size="sm"
      value={value}
      onChange={(next) => {
        // Astryx's single-select group deselects the active button to
        // `null` on re-click. This toggle has no "off" state, so a
        // deselect -- i.e. clicking the option that is already active --
        // is a no-op rather than a call with a viewport that isn't one.
        if (next != null && next !== value) {
          onChange(next as PrototypeViewport);
        }
      }}
    >
      <ToggleButton value="desktop" label="Desktop" />
      <ToggleButton value="mobile" label="Mobile" />
    </ToggleButtonGroup>
  );
}
