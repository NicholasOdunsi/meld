"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Fullscreen } from "@boxicons/react/Fullscreen";
import type { FlowDocument, FlowNodeKind } from "@meld/contracts";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { startUserFlow } from "@/features/canvas/user-flow-lifecycle";
import {
  layoutFlowPreview,
  type FlowPreviewLayout,
} from "../flow-preview-layout";

// What "Expand" does, decided by the room page from the surface state and the
// viewer's canvas access:
//   - open   : the User Flows canvas already exists -> just navigate to it.
//   - start  : the viewer can start one -> create the lifecycle row, then
//              navigate (the canvas seeds itself from this journey when empty).
//   - dialog : no canvas access (view-only / trial off) -> show the flow in a
//              self-contained dialog so Expand never dead-ends.
export type FlowExpandTarget =
  | { mode: "dialog" }
  | { mode: "open"; href: string }
  | { mode: "start"; href: string; roomId: string };

// A node label rendered as SVG <text> cannot ellipsize itself, so a label wider
// than the box is trimmed to a character budget that fits the fixed node width.
const LABEL_MAX_CHARS = 14;

function truncateLabel(label: string): string {
  const trimmed = label.trim();
  return trimmed.length > LABEL_MAX_CHARS
    ? `${trimmed.slice(0, LABEL_MAX_CHARS - 1)}…`
    : trimmed;
}

// Every node shares the surface fill; only the outline distinguishes the flow's
// vocabulary (start/end/decision) so the thumbnail reads at a glance without a
// legend. Colors come from Astryx tokens so the preview follows the theme the
// same way the rest of the document does.
function nodeStroke(kind: FlowNodeKind): string {
  switch (kind) {
    case "start":
      return "var(--color-text-green)";
    case "end":
      return "var(--color-text-red)";
    case "decision":
      return "var(--color-border-emphasized)";
    default:
      return "var(--color-border)";
  }
}

export function FlowPreviewDiagram({
  layout,
  maxHeight = "16rem",
}: {
  layout: FlowPreviewLayout;
  maxHeight?: string;
}) {
  // Unique per instance so the card and the expanded dialog can both render the
  // diagram without colliding on the marker's DOM id.
  const arrowId = useId();
  return (
    <svg
      role="img"
      aria-label="User journey flow preview"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ maxHeight, display: "block" }}
    >
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="var(--color-border-emphasized)" />
        </marker>
      </defs>
      {layout.edges.map((edge) => (
        <line
          key={edge.id}
          x1={edge.x1}
          y1={edge.y1}
          x2={edge.x2}
          y2={edge.y2}
          stroke="var(--color-border-emphasized)"
          strokeWidth={1.5}
          markerEnd={`url(#${arrowId})`}
        />
      ))}
      {layout.nodes.map((node) => (
        <g key={node.id}>
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={6}
            ry={6}
            fill="var(--color-background-surface)"
            stroke={nodeStroke(node.kind)}
            strokeWidth={1.5}
          />
          <text
            x={node.x + node.width / 2}
            y={node.y + node.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fill="var(--color-text-primary)"
          >
            {truncateLabel(node.label)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// The read-only preview of the User-journeys flow: a small "canvas" whose
// Expand control opens the room's live User Flows canvas (seeded from this
// journey) when the viewer can reach it, and otherwise falls back to a
// self-contained dialog so Expand never dead-ends. See FlowExpandTarget.
export function FlowPreview({
  flow,
  expand = { mode: "dialog" },
}: {
  flow: FlowDocument;
  expand?: FlowExpandTarget;
}) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const layout = layoutFlowPreview(flow);

  async function handleExpand() {
    if (expand.mode === "open") {
      router.push(expand.href);
      return;
    }
    if (expand.mode === "start") {
      setIsStarting(true);
      try {
        await startUserFlow(expand.roomId);
        router.push(expand.href);
      } catch {
        // Starting the canvas failed; show the flow in the dialog rather than
        // navigating to a tab that would not resolve.
        setIsDialogOpen(true);
      } finally {
        setIsStarting(false);
      }
      return;
    }
    setIsDialogOpen(true);
  }

  return (
    <VStack gap={2} width="100%" data-testid="prd-user-journey-flow-preview">
      <VStack
        width="100%"
        padding={3}
        style={{
          position: "relative",
          border: "var(--border-width) solid var(--color-border)",
          borderRadius: "var(--radius-element)",
          backgroundColor: "var(--color-background-body)",
          overflow: "hidden",
        }}
      >
        <FlowPreviewDiagram layout={layout} />
        <HStack
          style={{
            position: "absolute",
            top: "var(--spacing-2)",
            right: "var(--spacing-2)",
          }}
        >
          <Button
            size="sm"
            variant="secondary"
            label="Expand"
            icon={<Fullscreen pack="basic" size="sm" />}
            isLoading={isStarting}
            onClick={() => void handleExpand()}
          />
        </HStack>
      </VStack>
      {flow.summary ? (
        <Text type="supporting" color="secondary">
          {flow.summary}
        </Text>
      ) : null}
      <Dialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        width="min(90vw, calc(var(--spacing-12) * 16))"
      >
        <DialogHeader
          title={flow.title}
          subtitle={flow.summary}
          onOpenChange={setIsDialogOpen}
        />
        <VStack gap={4} padding={4} width="100%">
          <FlowPreviewDiagram layout={layout} maxHeight="70vh" />
        </VStack>
      </Dialog>
    </VStack>
  );
}
