import { createElement } from "react";
import { CodeXml, Redo2, SquareMousePointer, Undo2 } from "lucide-react";
import type { PillItem } from "../chrome/screen-pill";

const ICON_SIZE = 17;
const icon = (Icon: typeof CodeXml) => createElement(Icon, { size: ICON_SIZE, strokeWidth: 1.75, "aria-hidden": true });

// What the pill under a screen offers, asleep or awake: Edit (only when it can be edited), Undo and
// Redo (only with history), Code, in groups.
export function screenPillItems(input: {
  edit?: { pressed: boolean; onToggle: () => void };
  history?: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void };
  onCode: () => void;
}): PillItem[] {
  const { edit, history } = input;
  const groups: PillItem[][] = [
    edit ? [{ kind: "button", label: "Edit", icon: icon(SquareMousePointer), onPress: edit.onToggle, pressed: edit.pressed }] : [],
    history ? [
      { kind: "button", label: "Undo", icon: icon(Undo2), onPress: history.onUndo, disabled: !history.canUndo },
      { kind: "button", label: "Redo", icon: icon(Redo2), onPress: history.onRedo, disabled: !history.canRedo },
    ] : [],
    [{ kind: "button", label: "Code", icon: icon(CodeXml), onPress: input.onCode }],
  ];
  return groups.filter((group) => group.length > 0).flatMap((group, index): PillItem[] => index === 0 ? group : [{ kind: "divider" }, ...group]);
}
