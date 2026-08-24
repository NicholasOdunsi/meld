import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/VStack";
import type { PrototypeScreenSummary } from "@/features/design/prototype-reader";

export type PrototypeViewerProps = {
  html: string | null;
  screenCount: number;
  // Not yet rendered here -- carried through so the screen pill (a later
  // task) can list screens by name without this component needing to change
  // shape again. Optional so existing call sites that predate the pill
  // don't all need updating in this task; see
  // docs/superpowers/plans/2026-08-24-prototype-view-chrome.md.
  screens?: PrototypeScreenSummary[];
};

export function PrototypeViewer({
  html,
  screenCount,
}: PrototypeViewerProps) {
  if (html === null) {
    return (
      <VStack
        width="100%"
        height="100%"
        padding={6}
        hAlign="center"
        vAlign="center"
      >
        <EmptyState
          title="No screens built yet"
          description="Generate a screen to see the prototype."
        />
      </VStack>
    );
  }

  return (
    <VStack
      gap={0}
      width="100%"
      height="100%"
      style={{ backgroundColor: "var(--color-background-body)" }}
    >
      <iframe
        title={`Prototype preview (${screenCount} screen${screenCount === 1 ? "" : "s"})`}
        sandbox="allow-scripts"
        srcDoc={html}
        style={{ width: "100%", height: "100%", border: "0" }}
      />
    </VStack>
  );
}
