"use client";

import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef, useState } from "react";

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

function findTarget(id: string): HTMLElement | null {
  const direct = document.getElementById(id);
  if (direct) return direct;
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[data-meldid]"))
      .find((element) => element.getAttribute("data-meldid") === id) ?? null
  );
}

// A far-right minimap of the PRD sections: one 2px line per section, the active
// one emphasized. Hovering reveals the full clickable Outline as an overlay that
// opens toward the document (leftward), so labels never shift the layout.
export function PrdOutlineRail({ items }: { items: OutlineRailItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>(items[0]?.id);
  // The one pane that actually scrolls, resolved once from the DOM. jumpTo
  // scrolls exactly this element instead of letting scrollIntoView walk and
  // move several ancestors at once, which stutters against the sticky rail.
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    const first = findTarget(items[0].id);
    const container = getScrollParent(first);
    scrollContainerRef.current = container;
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
        const element = findTarget(item.id);
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
    const element = findTarget(id);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

  return (
    <VStack
      align="end"
      // Stable selector for the rail without coupling tests to generated
      // Astryx class names.
      data-testid="prd-outline-rail"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        flexShrink: 0,
        // sticky, not fixed. `fixed` anchors to the browser window, so when the
        // document moved to a different pane the rail stayed where the window
        // edge was. sticky is scoped to this document's own scroll container:
        // it travels with the pane, and still pins while the document scrolls
        // underneath it -- which plain `absolute` would not do, because an
        // absolutely positioned child of a scroll container scrolls with it.
        position: "sticky",
        // The offset sticky pins at: half way down the scrollport, then shifted
        // up by half the rail's own height to sit centred.
        top: "50%",
        transform: "translateY(-50%)",
        // In flow now rather than lifted out of it, so it never overlaps the
        // reading column. It is carried to the pane's right edge by the reading
        // column's own auto side-margins absorbing the free space -- NOT by an
        // auto margin here, which would eat the space on one side only and drag
        // the document hard against the left edge.
        alignSelf: "flex-start",
        zIndex: 3,
        padding: "var(--spacing-8) var(--spacing-5)",
      }}
    >
      <VStack gap={0} align="end">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={`Go to ${item.label}`}
            title={item.label}
            onClick={() => jumpTo(item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              width: "var(--spacing-7)",
              height: "calc(var(--spacing-0-5) + var(--spacing-2))",
              padding: "var(--spacing-0)",
              border: "var(--spacing-0)",
              backgroundColor: "transparent",
              cursor: "pointer",
            }}
          >
            <VStack
              width="var(--spacing-5)"
              style={{
                height: "var(--spacing-0-5)",
                borderRadius: "var(--radius-inner)",
                backgroundColor:
                  item.id === activeId
                    ? "var(--color-background-inverted)"
                    : "var(--color-border-emphasized)",
              }}
            />
          </button>
        ))}
      </VStack>

      {expanded ? (
        <VStack
          style={{
            position: "absolute",
            top: "var(--spacing-6)",
            right:
              "calc(var(--spacing-5) + var(--spacing-7) + var(--spacing-2))",
            zIndex: 2,
            width: "calc(var(--spacing-12) * 6)",
            maxWidth: "calc(100vw - var(--spacing-12) * 2)",
            maxHeight:
              "min(44vh, calc(var(--spacing-12) * 7))",
            overflowY: "auto",
            overscrollBehavior: "contain",
            scrollbarGutter: "stable",
            padding: "var(--spacing-2)",
            backgroundColor: "var(--color-background-popover)",
            border: "var(--spacing-0-5) solid var(--color-border)",
            borderRadius: "var(--radius-element)",
            boxShadow:
              "var(--spacing-0) var(--spacing-2) var(--spacing-6) var(--color-shadow)",
          }}
        >
          <VStack gap={0} width="100%" aria-label="On this page">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                onClick={() => {
                  jumpTo(item.id);
                  setExpanded(false);
                }}
                style={{
                  width: "100%",
                  padding: "var(--spacing-1) var(--spacing-2)",
                  border: "var(--spacing-0)",
                  borderInlineStart:
                    item.id === activeId
                      ? "var(--spacing-0-5) solid var(--color-border-strong)"
                      : "var(--spacing-0-5) solid transparent",
                  backgroundColor: "transparent",
                  color:
                    item.id === activeId
                      ? "var(--color-text-primary)"
                      : "var(--color-text-secondary)",
                  fontFamily: "var(--font-family-body)",
                  fontSize: "var(--text-supporting-size)",
                  fontWeight: "var(--text-supporting-weight)",
                  lineHeight: "var(--text-supporting-leading)",
                  textAlign: "start",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  cursor: "pointer",
                }}
              >
                {item.label}
              </button>
            ))}
          </VStack>
        </VStack>
      ) : null}
    </VStack>
  );
}
