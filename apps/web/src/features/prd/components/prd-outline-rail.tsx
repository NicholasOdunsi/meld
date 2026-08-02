"use client";

import { Outline } from "@astryxdesign/core/Outline";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useState } from "react";

export type OutlineRailItem = { id: string; label: string };

// Walk up from a section element to the element that actually scrolls, so
// scroll-spy works whether the document scrolls in its own pane or the window.
function getScrollParent(element: HTMLElement | null): HTMLElement | null {
  let node = element?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

// A far-right minimap of the PRD sections: one 2px line per section, the active
// one emphasized. Hovering reveals the full clickable Outline as an overlay that
// opens toward the document (leftward), so labels never shift the layout.
export function PrdOutlineRail({ items }: { items: OutlineRailItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>(items[0]?.id);

  useEffect(() => {
    if (items.length === 0) return;
    const first = document.getElementById(items[0].id);
    const container = getScrollParent(first);
    const scrollTarget: HTMLElement | Window = container ?? window;

    const compute = () => {
      const viewportTop = container
        ? container.getBoundingClientRect().top
        : 0;
      const viewportHeight = container
        ? container.clientHeight
        : window.innerHeight;
      // Activate the last section whose heading has crossed a line 30% down
      // the scroll pane.
      const activationLine = viewportTop + viewportHeight * 0.3;
      let current = items[0].id;
      for (const item of items) {
        const element = document.getElementById(item.id);
        if (element && element.getBoundingClientRect().top <= activationLine) {
          current = item.id;
        }
      }
      // At the very bottom no heading can reach the line, so snap to the last
      // section — otherwise the active bar strands in the middle.
      if (
        container &&
        container.scrollTop + container.clientHeight >=
          container.scrollHeight - 2
      ) {
        current = items[items.length - 1].id;
      }
      setActiveId(current);
    };

    compute();
    scrollTarget.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      scrollTarget.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [items]);

  const jumpTo = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

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
        alignSelf: "flex-start",
        position: "sticky",
        top: "var(--spacing-0)",
        padding: "var(--spacing-8) var(--spacing-5)",
      }}
    >
      <VStack gap={2} align="end" aria-hidden>
        {items.map((item) => (
          <VStack
            key={item.id}
            width="var(--spacing-7)"
            style={{
              height: "var(--spacing-0-5)",
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
            right: "var(--spacing-5)",
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
            onActiveIdChange={jumpTo}
            density="compact"
            label="On this page"
          />
        </VStack>
      ) : null}
    </VStack>
  );
}
