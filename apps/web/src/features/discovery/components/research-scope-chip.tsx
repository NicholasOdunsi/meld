"use client";

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import type { ResearchScope } from "@meld/contracts";
import { ComposerChip } from "./composer-chip";

const SCOPE_LABEL: Record<ResearchScope, string> = {
  room: "Room only",
  web: "Web + room",
};

const MENU_LABEL = "Research sources";

// Rendered only while the Research Agent is addressed -- unlike the routing
// chip, this dimension does not exist for other agents, and inventing a resting
// state for it would state something untrue.
export function ResearchScopeChip({
  scope,
  onChange,
}: {
  scope: ResearchScope;
  onChange: (scope: ResearchScope) => void;
}) {
  return (
    <ComposerChip
      label={SCOPE_LABEL[scope]}
      tone="active"
      menuLabel={MENU_LABEL}
      testId="research-scope-picker"
    >
      <DropdownMenuRadioGroup
        aria-label={MENU_LABEL}
        value={scope}
        onChange={(next) => onChange(next as ResearchScope)}
      >
        <DropdownMenuRadioItem value="room" label={SCOPE_LABEL.room} />
        <DropdownMenuRadioItem value="web" label={SCOPE_LABEL.web} />
      </DropdownMenuRadioGroup>
    </ComposerChip>
  );
}
