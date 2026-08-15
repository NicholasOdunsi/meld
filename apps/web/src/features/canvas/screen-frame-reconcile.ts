import {
  FORM_FACTOR_SIZES,
  frameSizeForFormFactor,
  type FormFactor,
} from "@meld/prototype";
import { createShapeId, type TLFrameShape } from "@tldraw/tlschema";

export const SCREEN_FRAME_COLOR: TLFrameShape["props"]["color"] = "black";

// The size pre-form-factor frames were created at (the historical hardcoded
// default, equal to the `mobile` preset). A frame still at exactly this size is
// treated as "never intentionally sized", so it may be snapped to its screen's
// form factor; any other size is assumed to be a deliberate (e.g. user) choice
// and left alone.
export const LEGACY_DEFAULT_FRAME = FORM_FACTOR_SIZES.mobile;

export type ExistingScreenFrame = {
  id: string;
  meldScreenId: string | null;
  w: number;
  h: number;
};

export type ScreenFrameRow = {
  id: string;
  name: string;
  canvasX: number;
  canvasY: number;
  formFactor?: FormFactor | null;
};

export type ScreenFrameRecordInput = {
  id: string;
  name: string;
  x: number;
  y: number;
  pageId: string;
  index: string;
  formFactor?: FormFactor | null;
};

export type ScreenFrameResize = { id: string; w: number; h: number };

export type ScreenFrameReconciliation = {
  toCreate: string[];
  toResize: ScreenFrameResize[];
  orphans: string[];
  duplicates: string[];
};

export function screenFrameId(meldScreenId: string): string {
  return createShapeId(`screen-${meldScreenId}`);
}

export function screenFrameRecord(
  input: ScreenFrameRecordInput,
): TLFrameShape {
  const size = frameSizeForFormFactor(input.formFactor);
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
      w: size.w,
      h: size.h,
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

  // Snap a keeper frame to its screen's form-factor size only when it is still
  // at the legacy default -- so a desktop/tablet screen seeded (or pre-created)
  // as a phone frame gets the right size on generation, while any frame the user
  // has resized keeps its size.
  const frameById = new Map(existingFrames.map((frame) => [frame.id, frame]));
  const toResize: ScreenFrameResize[] = [];
  for (const row of rows) {
    const keeperId = keeperIdByScreen.get(row.id);
    if (keeperId === undefined) continue;
    const frame = frameById.get(keeperId);
    if (!frame) continue;
    if (
      frame.w !== LEGACY_DEFAULT_FRAME.w ||
      frame.h !== LEGACY_DEFAULT_FRAME.h
    ) {
      continue;
    }
    const size = frameSizeForFormFactor(row.formFactor);
    if (size.w !== frame.w || size.h !== frame.h) {
      toResize.push({ id: keeperId, w: size.w, h: size.h });
    }
  }

  return {
    toCreate: rows
      .filter((row) => !keeperIdByScreen.has(row.id))
      .map((row) => row.id),
    toResize,
    orphans,
    duplicates,
  };
}
