import type { FlowDocument, FlowNode } from "@meld/contracts";
import {
  createBindingId,
  createShapeId,
  toRichText,
  type TLArrowBinding,
  type TLArrowShape,
  type TLFrameShape,
  type TLGeoShape,
  type TLNoteShape,
  type TLRecord,
  type TLTextShape,
} from "@tldraw/tlschema";
import { getIndexAbove, getIndicesAbove, type Editor } from "tldraw";
import type { UserFlowGeneration } from "./user-flow-generation";

const NODE_WIDTH = 220;
const MIN_NODE_HEIGHT = 100;
const HORIZONTAL_GAP = 90;
const VERTICAL_GAP = 50;
const FRAME_PADDING = 40;
const MIN_HEADER_HEIGHT = 120;
const QUESTION_WIDTH = 200;
const QUESTION_HEIGHT = 200;
const QUESTION_GAP = 30;
const QUESTION_COLUMNS = 3;
const INSERTION_GAP = 160;
const FLOW_COLORS = {
  green: "green",
  blue: "blue",
  orange: "orange",
  red: "red",
  black: "black",
  yellow: "yellow",
} as const;
const SOLID_FILL = "solid" as const;
const NO_FILL = "none" as const;

type MapperInput = {
  taskId: string;
  document: FlowDocument;
  originX: number;
  originY: number;
  createdAt?: string;
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
  return depths;
}

function nodeGeo(node: FlowNode): TLGeoShape["props"]["geo"] {
  if (node.kind === "decision") return "diamond";
  if (node.kind === "start" || node.kind === "end") return "ellipse";
  return "rectangle";
}

function nodeColor(node: FlowNode): TLGeoShape["props"]["color"] {
  switch (node.kind) {
    case "start": return FLOW_COLORS.green;
    case "end": return FLOW_COLORS.red;
    case "decision": return FLOW_COLORS.orange;
    case "system": return FLOW_COLORS.blue;
    default: return FLOW_COLORS.black;
  }
}

function nodeHeight(node: FlowNode): number {
  const text = node.detail ? `${node.label}\n${node.detail}` : node.label;
  const lines = text.split("\n").reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / 24)),
    0,
  );
  return Math.max(MIN_NODE_HEIGHT, 48 + lines * 24);
}

function provenanceText(createdAt?: string): string {
  return createdAt
    ? `Agent-generated Draft · ${createdAt}`
    : "Agent-generated Draft";
}

function textBlockHeight(text: string, charactersPerLine: number): number {
  const lines = text.split("\n").reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)),
    0,
  );
  return lines * 22;
}

export function flowDocumentToTldrawRecords(input: MapperInput): FlowTldrawRecords {
  const { taskId, document, originX, originY, createdAt } = input;
  const frameId = shapeId(`flow:${taskId}:frame`);
  const depths = depthMap(document);
  const maxDepth = Math.max(0, ...[...depths.values()]);
  const flowWidth = FRAME_PADDING * 2 + (maxDepth + 1) * NODE_WIDTH
    + maxDepth * HORIZONTAL_GAP;
  const questionsWidth = FRAME_PADDING * 2
    + Math.min(QUESTION_COLUMNS, document.openQuestions.length) * QUESTION_WIDTH
    + Math.max(0, Math.min(QUESTION_COLUMNS, document.openQuestions.length) - 1) * QUESTION_GAP;
  const frameWidth = Math.max(flowWidth, questionsWidth, 640);
  const headerHeight = Math.max(
    MIN_HEADER_HEIGHT,
    44 + textBlockHeight(`${document.title}\n${document.summary}`, Math.floor(frameWidth / 9)) + 34,
  );
  const columnY = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number; h: number }>();
  let nodeBottom = headerHeight;

  for (const node of document.nodes) {
    const depth = depths.get(node.id) ?? 0;
    const y = columnY.get(depth) ?? headerHeight;
    const h = nodeHeight(node);
    positions.set(node.id, {
      x: FRAME_PADDING + depth * (NODE_WIDTH + HORIZONTAL_GAP),
      y,
      h,
    });
    columnY.set(depth, y + h + VERTICAL_GAP);
    nodeBottom = Math.max(nodeBottom, y + h);
  }

  const questionRows = Math.ceil(document.openQuestions.length / QUESTION_COLUMNS);
  const questionsTop = nodeBottom + (document.openQuestions.length > 0 ? VERTICAL_GAP : 0);
  const frameHeight = questionsTop
    + questionRows * QUESTION_HEIGHT
    + Math.max(0, questionRows - 1) * QUESTION_GAP
    + FRAME_PADDING;
  const generatedMeta = {
    meld: {
      generated: true,
      taskId,
      flowTitle: document.title,
      source: "product-agent",
      createdAt: createdAt ?? null,
    },
  };
  const recordCount = 3 + document.nodes.length + document.edges.length
    + document.edges.length * 2 + document.openQuestions.length;
  const indices = getIndicesAbove(null, recordCount);
  let indexCursor = 0;

  const frame: TLFrameShape = {
    id: frameId,
    typeName: "shape",
    type: "frame",
    x: originX,
    y: originY,
    rotation: 0,
    index: indices[indexCursor++],
    parentId: "page:page" as TLFrameShape["parentId"],
    isLocked: false,
    opacity: 1,
    props: {
      w: frameWidth,
      h: frameHeight,
      name: `${document.title} - Draft`,
      color: FLOW_COLORS.blue,
    },
    meta: generatedMeta,
  };
  const title: TLTextShape = {
    id: shapeId(`flow:${taskId}:title`),
    typeName: "shape",
    type: "text",
    x: FRAME_PADDING,
    y: 24,
    rotation: 0,
    index: indices[indexCursor++],
    parentId: frameId,
    isLocked: false,
    opacity: 1,
    props: {
      color: FLOW_COLORS.black,
      size: "m",
      font: "sans",
      textAlign: "start",
      w: frameWidth - FRAME_PADDING * 2,
      richText: toRichText(`${document.title}\n${document.summary}`),
      scale: 1,
      autoSize: false,
    },
    meta: { ...generatedMeta, flowRole: "summary" },
  };
  const provenance: TLTextShape = {
    id: shapeId(`flow:${taskId}:provenance`),
    typeName: "shape",
    type: "text",
    x: FRAME_PADDING,
    y: headerHeight - 30,
    rotation: 0,
    index: indices[indexCursor++],
    parentId: frameId,
    isLocked: false,
    opacity: 1,
    props: {
      color: FLOW_COLORS.blue,
      size: "s",
      font: "sans",
      textAlign: "start",
      w: frameWidth - FRAME_PADDING * 2,
      richText: toRichText(provenanceText(createdAt)),
      scale: 1,
      autoSize: false,
    },
    meta: { ...generatedMeta, flowRole: "provenance" },
  };
  const nodeShapes: TLGeoShape[] = document.nodes.map((node) => {
    const position = positions.get(node.id)!;
    const label = node.detail ? `${node.label}\n${node.detail}` : node.label;
    return {
      id: shapeId(`flow:${taskId}:node:${node.id}`),
      typeName: "shape",
      type: "geo",
      x: position.x,
      y: position.y,
      rotation: 0,
      index: indices[indexCursor++],
      parentId: frameId,
      isLocked: false,
      opacity: 1,
      props: {
        geo: nodeGeo(node),
        dash: "solid",
        url: "",
        w: NODE_WIDTH,
        h: position.h,
        growY: 0,
        scale: 1,
        flipX: false,
        flipY: false,
        labelColor: FLOW_COLORS.black,
        color: nodeColor(node),
        fill: SOLID_FILL,
        size: "m",
        font: "draw",
        align: "middle",
        verticalAlign: "middle",
        richText: toRichText(label),
      },
      meta: { ...generatedMeta, flowNodeId: node.id, flowNodeKind: node.kind },
    };
  });

  const arrows: TLArrowShape[] = [];
  const bindings: TLArrowBinding[] = [];
  for (const edge of document.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    const arrowId = shapeId(`flow:${taskId}:edge:${edge.id}`);
    arrows.push({
      id: arrowId,
      typeName: "shape",
      type: "arrow",
      x: 0,
      y: 0,
      rotation: 0,
      index: indices[indexCursor++],
      parentId: frameId,
      isLocked: false,
      opacity: 1,
      props: {
        kind: "elbow",
        labelColor: FLOW_COLORS.black,
        color: FLOW_COLORS.black,
        fill: NO_FILL,
        dash: "solid",
        size: "m",
        arrowheadStart: "none",
        arrowheadEnd: "arrow",
        font: "draw",
        start: { x: from.x + NODE_WIDTH, y: from.y + from.h / 2 },
        end: { x: to.x, y: to.y + to.h / 2 },
        bend: 0,
        richText: toRichText(edge.label ?? ""),
        labelPosition: 0.5,
        scale: 1,
        elbowMidPoint: 0.5,
      },
      meta: { ...generatedMeta, flowEdgeId: edge.id, from: edge.from, to: edge.to },
    });
    bindings.push(
      {
        id: createBindingId(`flow:${taskId}:edge:${edge.id}:start`),
        typeName: "binding",
        type: "arrow",
        fromId: arrowId,
        toId: shapeId(`flow:${taskId}:node:${edge.from}`),
        props: {
          terminal: "start",
          normalizedAnchor: { x: 1, y: 0.5 },
          isExact: false,
          isPrecise: true,
          snap: "edge",
        },
        meta: generatedMeta,
      },
      {
        id: createBindingId(`flow:${taskId}:edge:${edge.id}:end`),
        typeName: "binding",
        type: "arrow",
        fromId: arrowId,
        toId: shapeId(`flow:${taskId}:node:${edge.to}`),
        props: {
          terminal: "end",
          normalizedAnchor: { x: 0, y: 0.5 },
          isExact: false,
          isPrecise: true,
          snap: "edge",
        },
        meta: generatedMeta,
      },
    );
  }

  const questionNotes: TLNoteShape[] = document.openQuestions.map((question, questionIndex) => ({
    id: shapeId(`flow:${taskId}:question:${questionIndex}`),
    typeName: "shape",
    type: "note",
    x: FRAME_PADDING + (questionIndex % QUESTION_COLUMNS) * (QUESTION_WIDTH + QUESTION_GAP),
    y: questionsTop + Math.floor(questionIndex / QUESTION_COLUMNS) * (QUESTION_HEIGHT + QUESTION_GAP),
    rotation: 0,
    index: indices[indexCursor++],
    parentId: frameId,
    isLocked: false,
    opacity: 1,
    props: {
      color: FLOW_COLORS.yellow,
      labelColor: FLOW_COLORS.black,
      size: "s",
      font: "sans",
      fontSizeAdjustment: null,
      align: "start",
      verticalAlign: "start",
      growY: 0,
      url: "",
      richText: toRichText(`Open question\n${question}`),
      scale: 1,
      textLastEditedBy: null,
    },
    meta: { ...generatedMeta, flowRole: "open-question", questionIndex },
  }));

  return {
    frameId,
    records: [frame, title, provenance, ...nodeShapes, ...arrows, ...bindings, ...questionNotes],
  };
}

export function findGeneratedFlowOrigin(editor: Editor): { x: number; y: number } {
  const bounds = editor.getCurrentPageBounds();
  return bounds
    ? { x: bounds.x + bounds.w + INSERTION_GAP, y: bounds.y }
    : { x: 100, y: 100 };
}

export function applyGeneratedFlow(editor: Editor, generation: UserFlowGeneration): string {
  const identity = flowDocumentToTldrawRecords({
    taskId: generation.taskId,
    document: generation.document,
    originX: 0,
    originY: 0,
    createdAt: generation.createdAt,
  });
  if (editor.getShape(identity.frameId as never)) return identity.frameId;

  const origin = findGeneratedFlowOrigin(editor);
  const mapped = flowDocumentToTldrawRecords({
    taskId: generation.taskId,
    document: generation.document,
    originX: origin.x,
    originY: origin.y,
    createdAt: generation.createdAt,
  });
  const pageId = editor.getCurrentPageId();
  const frameIndex = getIndexAbove(editor.getHighestIndexForParent(pageId));
  const records = mapped.records.map((record) => {
    if (record.id === mapped.frameId && record.typeName === "shape") {
      return { ...record, parentId: pageId, index: frameIndex };
    }
    return record;
  });
  editor.run(() => {
    editor.store.put(records);
  });
  const frame = editor.getShape(mapped.frameId as never) as TLFrameShape | undefined;
  if (frame) {
    editor.zoomToBounds(
      { x: frame.x, y: frame.y, w: frame.props.w, h: frame.props.h },
      { animation: { duration: 200 } },
    );
  }
  return mapped.frameId;
}
