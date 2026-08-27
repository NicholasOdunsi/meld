import type { ReactNode } from "react";
import type { UserFlowTrialTabProps } from "@/features/canvas/user-flow-trial-tab";
import { UserFlowTrialTab } from "@/features/canvas/user-flow-trial-tab-loader";
import {
  PrototypeViewer,
  type PrototypeViewerProps,
} from "@/features/design/components/prototype-viewer";
import {
  PrdDocument,
  type PrdDocumentProps,
} from "@/features/prd/components/prd-document";
import { MeldButton } from "@/ui/meld/button";
import { MeldRegion } from "@/ui/meld/region";
import {
  MeldCenteredActions,
  MeldNote,
  MeldStack,
} from "@/ui/meld/stack";
import type { PaneTool } from "../pane-layout";

export type RoomPaneData = {
  /** Props for the canvas surface, when it has been loaded for this pane. */
  canvas: UserFlowTrialTabProps | null | undefined;
  /** Props for the prototype surface, when it has been loaded for this pane. */
  prototype: PrototypeViewerProps | null | undefined;
  /** Props for the PRD surface; `undefined` means the document does not exist. */
  prd: PrdDocumentProps | null | undefined;
};

export type PaneContentProps = {
  tool: PaneTool;
  data: RoomPaneData;
  onRequestAction?: () => void;
};

/* Display labels only. The KEYS are the contract -- `PaneTool` values are what
 * `room_tabs.panes` stores, what `pane-layout.ts` reasons about and what the
 * PRD tables are named after -- so a tool can be renamed in the UI without a
 * migration, as long as the key is left alone. `prd` reads as "Document"
 * because that is what it is to the person using it; the schema still calls
 * it a PRD and does not need to change. */
export const PANE_TITLES: Record<PaneTool, string> = {
  canvas: "Canvas",
  prototype: "Prototype",
  prd: "Document",
};

const EMPTY_STATE_COPY: Record<PaneTool, string> = {
  canvas: "Ask meld to create a Canvas",
  prototype: "Ask meld to build a Prototype",
  prd: "Ask meld to draft a Document",
};

function PaneEmptyState({
  tool,
  onRequestAction,
}: {
  tool: PaneTool;
  onRequestAction?: () => void;
}) {
  return (
    <MeldRegion data-testid={`${tool}-empty-state`}>
      <MeldStack gap={4}>
        <MeldNote>No {PANE_TITLES[tool]} yet.</MeldNote>
        <MeldCenteredActions>
          <MeldButton
            label={EMPTY_STATE_COPY[tool]}
            variant="secondary"
            onClick={onRequestAction}
          />
        </MeldCenteredActions>
      </MeldStack>
    </MeldRegion>
  );
}

function surfaceProps<T extends object>(props: T | null): T {
  // `null` is used by lightweight shell fixtures while an active surface's
  // server-loaded props are being supplied. The real surfaces own their
  // loading states; `undefined` is reserved for an absent artifact.
  return props ?? ({} as T);
}

export function PaneContent({
  tool,
  data,
  onRequestAction,
}: PaneContentProps): ReactNode {
  switch (tool) {
    case "canvas":
      return data.canvas === undefined ? (
        <PaneEmptyState tool={tool} onRequestAction={onRequestAction} />
      ) : (
        <UserFlowTrialTab {...surfaceProps(data.canvas)} />
      );
    case "prototype":
      return data.prototype === undefined ? (
        <PaneEmptyState tool={tool} onRequestAction={onRequestAction} />
      ) : (
        <PrototypeViewer {...surfaceProps(data.prototype)} />
      );
    case "prd":
      return data.prd === undefined ? (
        <PaneEmptyState tool={tool} onRequestAction={onRequestAction} />
      ) : (
        <PrdDocument {...surfaceProps(data.prd)} />
      );
  }
}
