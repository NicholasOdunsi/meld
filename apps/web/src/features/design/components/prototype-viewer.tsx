import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/VStack";

export type PrototypeViewerProps = {
  html: string | null;
  screenCount: number;
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
