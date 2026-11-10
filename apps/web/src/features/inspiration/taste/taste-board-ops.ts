import { applyTasteOperation, type TasteBoard, type TasteOperation } from "@meld/contracts";
import { tasteValueLabel } from "./describe-suggestion";

/** Not me on an add records the value as a dislike (taste-profile spec B3). */
export function withRejectedAvoid(board: TasteBoard, op: TasteOperation): TasteBoard {
  if (op.op !== "add" || op.tile === "avoid") return board;
  const next = applyTasteOperation(board, {
    tile: "avoid",
    op: "add",
    value: { text: tasteValueLabel(op).slice(0, 80), source: "rejected" },
  });
  return next ?? board;
}
