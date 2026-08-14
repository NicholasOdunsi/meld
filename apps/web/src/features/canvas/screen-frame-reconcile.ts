import { createShapeId, type TLFrameShape } from "@tldraw/tlschema";

export const SCREEN_FRAME_COLOR: TLFrameShape["props"]["color"] = "black";

export type ExistingScreenFrame = {
  id: string;
  meldScreenId: string | null;
};

export type ScreenFrameRow = {
  id: string;
  name: string;
  canvasX: number;
  canvasY: number;
};

export type ScreenFrameRecordInput = {
  id: string;
  name: string;
  x: number;
  y: number;
  pageId: string;
  index: string;
};

export type ScreenFrameReconciliation = {
  toCreate: string[];
  orphans: string[];
  duplicates: string[];
};

export function screenFrameId(meldScreenId: string): string {
  return createShapeId(`screen-${meldScreenId}`);
}

export function screenFrameRecord(
  input: ScreenFrameRecordInput,
): TLFrameShape {
  return {
    id: screenFrameId(input.id) as TLFrameShape["id"],
    typeName: "shape",
    type: "frame",
    x: input.x,
    y: input.y,
    rotation: 0,
    index: input.index as TLFrameShape["index"],
    parentId: input.pageId as TLFrameShape["parentId"],
    isLocked: false,
    opacity: 1,
    props: {
      w: 390,
      h: 844,
      name: input.name,
      color: SCREEN_FRAME_COLOR,
    },
    meta: { meldScreenId: input.id },
  };
}

export function reconcileScreenFrames(
  existingFrames: ExistingScreenFrame[],
  rows: ScreenFrameRow[],
): ScreenFrameReconciliation {
  const rowIds = new Set(rows.map((row) => row.id));
  const keeperIdByScreen = new Map<string, string>();
  const orphans: string[] = [];

  for (const frame of existingFrames) {
    if (frame.meldScreenId === null) continue;
    if (!rowIds.has(frame.meldScreenId)) {
      orphans.push(frame.id);
      continue;
    }
    const keeperId = keeperIdByScreen.get(frame.meldScreenId);
    const deterministicId = screenFrameId(frame.meldScreenId);
    if (keeperId === undefined || frame.id === deterministicId) {
      keeperIdByScreen.set(frame.meldScreenId, frame.id);
    }
  }

  const duplicates = existingFrames
    .filter(
      (frame) =>
        frame.meldScreenId !== null &&
        rowIds.has(frame.meldScreenId) &&
        keeperIdByScreen.get(frame.meldScreenId) !== frame.id,
    )
    .map((frame) => frame.id);

  return {
    toCreate: rows
      .filter((row) => !keeperIdByScreen.has(row.id))
      .map((row) => row.id),
    orphans,
    duplicates,
  };
}
