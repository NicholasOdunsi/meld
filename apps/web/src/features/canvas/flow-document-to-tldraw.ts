import type { FlowDocument, FlowNode } from "@meld/contracts";
import {
  createShapeId,
  toRichText,
  type TLArrowShape,
  type TLFrameShape,
  type TLGeoShape,
  type TLRecord,
} from "@tldraw/tlschema";
import type { Editor } from "tldraw";
import type { UserFlowGeneration } from "./user-flow-generation";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;
const HORIZONTAL_GAP = 90;
const VERTICAL_GAP = 50;
const FLOW_COLORS = {
  green: "green",
  blue: "blue",
  orange: "orange",
  red: "red",
  black: "black",
} as const;
const SOLID_FILL = "solid" as const;
const NO_FILL = "none" as const;

type MapperInput = {
  taskId: string;
  document: FlowDocument;
  originX: number;
  originY: number;
};

export type FlowTldrawRecords = {
  records: TLRecord[];
  frameId: string;
};

function shapeId(seed: string) {
  return createShapeId(seed);
}

function depthMap(document: FlowDocument): Map<string, number> {
  const depths = new Map<string, number>();
  const start = document.nodes.find((node) => node.kind === "start");
  if (!start) return depths;
  depths.set(start.id, 0);
  const outgoing = new Map<string, string[]>();
  for (const edge of document.edges) {
    const targets = outgoing.get(edge.from) ?? [];
    targets.push(edge.to);
    outgoing.set(edge.from, targets);
  }
  const queue = [start.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const target of outgoing.get(current) ?? []) {
      const nextDepth = (depths.get(current) ?? 0) + 1;
      if (!depths.has(target) || nextDepth < depths.get(target)!) {
        depths.set(target, nextDepth);
        queue.push(target);
      }
    }
  }
  for (const node of document.nodes) {
    if (!depths.has(node.id)) depths.set(node.id, depths.size);
  }
  return depths;
}

function nodeGeo(node: FlowNode): string {
  if (node.kind === "decision") return "diamond";
  if (node.kind === "start" || node.kind === "end") return "ellipse";
  return "rectangle";
}

function nodeColor(node: FlowNode): "green" | "blue" | "orange" | "red" | "black" {
  switch (node.kind) {
    case "start": return FLOW_COLORS.green;
    case "end": return FLOW_COLORS.red;
    case "decision": return FLOW_COLORS.orange;
    case "system": return FLOW_COLORS.blue;
    default: return FLOW_COLORS.black;
  }
}

function frameColor(): "blue" {
  return FLOW_COLORS.blue;
}

function arrowColor(): "black" {
  return FLOW_COLORS.black;
}

export function flowDocumentToTldrawRecords(input: MapperInput): FlowTldrawRecords {
  const { taskId, document, originX, originY } = input;
  const frameId = shapeId(`flow:${taskId}:frame`);
  const depths = depthMap(document);
  const rows = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of document.nodes) {
    const depth = depths.get(node.id) ?? 0;
    const row = rows.get(depth) ?? 0;
    rows.set(depth, row + 1);
    positions.set(node.id, {
      x: 40 + depth * (NODE_WIDTH + HORIZONTAL_GAP),
      y: 90 + row * (NODE_HEIGHT + VERTICAL_GAP),
    });
  }
  const maxDepth = Math.max(0, ...[...depths.values()]);
  const maxRow = Math.max(0, ...[...rows.values()]);
  const frameWidth = 120 + (maxDepth + 1) * (NODE_WIDTH + HORIZONTAL_GAP);
  const frameHeight = 150 + Math.max(1, maxRow) * (NODE_HEIGHT + VERTICAL_GAP);
  const meta = { meld: { generated: true, taskId, flowTitle: document.title } };
  const frame: TLFrameShape = {
    id: frameId,
    typeName: "shape",
    type: "frame",
    x: originX,
    y: originY,
    rotation: 0,
    index: "a1" as TLFrameShape["index"],
    parentId: "page:page" as TLFrameShape["parentId"],
    isLocked: false,
    opacity: 1,
    props: { w: frameWidth, h: frameHeight, name: `${document.title} - Draft`, color: frameColor() },
    meta,
  };
  const nodeShapes: TLGeoShape[] = document.nodes.map((node, index) => {
    const position = positions.get(node.id)!;
    const label = node.detail ? `${node.label}\n${node.detail}` : node.label;
    return {
      id: shapeId(`flow:${taskId}:node:${node.id}`),
      typeName: "shape",
      type: "geo",
      x: position.x,
      y: position.y,
      rotation: 0,
      index: `a${index + 2}` as TLGeoShape["index"],
      parentId: frameId as TLGeoShape["parentId"],
      isLocked: false,
      opacity: 1,
      props: {
        geo: nodeGeo(node) as TLGeoShape["props"]["geo"],
        dash: "solid",
        url: "",
        w: NODE_WIDTH,
        h: NODE_HEIGHT,
        growY: 0,
        scale: 1,
        flipX: false,
        flipY: false,
        labelColor: arrowColor(),
        color: nodeColor(node),
        fill: SOLID_FILL,
        size: "m",
        font: "draw",
        align: "middle",
        verticalAlign: "middle",
        richText: toRichText(label),
      },
      meta: { ...meta, flowNodeId: node.id, flowNodeKind: node.kind },
    };
  });
  const arrows: TLArrowShape[] = document.edges.flatMap((edge, index) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return [];
    return [{
      id: shapeId(`flow:${taskId}:edge:${edge.id}`),
      typeName: "shape",
      type: "arrow",
      x: originX,
      y: originY,
      rotation: 0,
      index: `b${index + 1}` as TLArrowShape["index"],
      parentId: "page:page" as TLArrowShape["parentId"],
      isLocked: false,
      opacity: 1,
      props: {
        kind: "elbow",
        labelColor: arrowColor(),
        color: arrowColor(),
        fill: NO_FILL,
        dash: "solid",
        size: "m",
        arrowheadStart: "none",
        arrowheadEnd: "arrow",
        font: "draw",
        start: { x: from.x + NODE_WIDTH, y: from.y + NODE_HEIGHT / 2 },
        end: { x: to.x, y: to.y + NODE_HEIGHT / 2 },
        bend: 0,
        richText: toRichText(edge.label ?? ""),
        labelPosition: 0.5,
        scale: 1,
        elbowMidPoint: 0.5,
      },
      meta: { ...meta, flowEdgeId: edge.id, from: edge.from, to: edge.to },
    }];
  });
  return { frameId, records: [frame, ...nodeShapes, ...arrows] };
}

export function applyGeneratedFlow(editor: Editor, generation: UserFlowGeneration): string {
  const mapped = flowDocumentToTldrawRecords({
    taskId: generation.taskId,
    document: generation.document,
    originX: 100,
    originY: 100,
  });
  const pageId = editor.getCurrentPageId();
  const records = mapped.records.map((record) =>
    record.typeName === "shape" && record.parentId === "page:page"
      ? { ...record, parentId: pageId }
      : record,
  );
  editor.run(() => {
    editor.store.put(records);
  });
  const frame = editor.getShape(mapped.frameId as never) as TLFrameShape | undefined;
  if (frame) editor.zoomToBounds({ x: frame.x, y: frame.y, w: frame.props.w, h: frame.props.h }, { animation: { duration: 200 } });
  return mapped.frameId;
}
