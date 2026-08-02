"use client";

import { Outline } from "@astryxdesign/core/Outline";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useState } from "react";

export type OutlineRailItem = { id: string; label: string };

// A minimap of the PRD sections: one short line per section, the active one
// emphasized. Hovering reveals the full, clickable Outline as an overlay so the
// labels never widen the column and shift the document. Active tracking is our
// own scroll-spy (IntersectionObserver) so the collapsed rail stays in sync
// without the Outline being mounted.
export function PrdOutlineRail({ items }: { items: OutlineRailItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>(items[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const topmost = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (topmost) setActiveId(topmost.target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    for (const item of items) {
      const element = document.getElementById(item.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [items]);

  const outlineItems = items.map((item) => ({
    id: item.id,
    label: item.label,
    level: 1 as const,
  }));

  return (
    <VStack
      align="end"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        flexShrink: 0,
        position: "sticky",
        top: "var(--spacing-0)",
        alignSelf: "flex-start",
        padding: "var(--spacing-8) var(--spacing-4)",
      }}
    >
      <VStack gap={2} align="end" aria-hidden>
        {items.map((item) => (
          <VStack
            key={item.id}
            width="var(--spacing-7)"
            style={{
              height: "var(--spacing-1)",
              borderRadius: "var(--radius-inner)",
              backgroundColor:
                item.id === activeId
                  ? "var(--color-background-inverted)"
                  : "var(--color-border-emphasized)",
            }}
          />
        ))}
      </VStack>

      {expanded ? (
        <VStack
          style={{
            position: "absolute",
            top: "var(--spacing-6)",
            left: "var(--spacing-2)",
            zIndex: 2,
            minWidth: "calc(var(--spacing-12) * 4)",
            padding: "var(--spacing-3)",
            backgroundColor: "var(--color-background-popover)",
            border: "var(--spacing-0-5) solid var(--color-border)",
            borderRadius: "var(--radius-element)",
            boxShadow:
              "var(--spacing-0) var(--spacing-2) var(--spacing-6) var(--color-shadow)",
          }}
        >
          <Outline
            items={outlineItems}
            activeId={activeId}
            onActiveIdChange={setActiveId}
            density="compact"
            label="On this page"
          />
        </VStack>
      ) : null}
    </VStack>
  );
}
