import { createElement } from "react";
import { CodeXml, MousePointer2, Play, Redo2, Undo2 } from "lucide-react";
import type { PillItem } from "../chrome/screen-pill";

const ICON_SIZE = 17;
const icon = (Icon: typeof Play) => createElement(Icon, { size: ICON_SIZE, strokeWidth: 1.75, "aria-hidden": true });

// What the pill under a screen offers. A sleeping screen: Open live and Code. An awake one:
// Edit (only when it can be edited), Undo and Redo (only with history), Code, in groups.
export function screenPillItems(input: {
  awake: boolean;
  edit?: { pressed: boolean; onToggle: () => void };
  history?: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void };
  onOpenLive: () => void;
  onCode: () => void;
}): PillItem[] {
  const code: PillItem = { kind: "button", label: "Code", icon: icon(CodeXml), onPress: input.onCode };
  if (!input.awake) return [{ kind: "button", label: "Open live", icon: icon(Play), onPress: input.onOpenLive }, code];
  const { edit, history } = input;
  const groups: PillItem[][] = [
    edit ? [{ kind: "button", label: "Edit", icon: icon(MousePointer2), onPress: edit.onToggle, pressed: edit.pressed }] : [],
    history ? [
      { kind: "button", label: "Undo", icon: icon(Undo2), onPress: history.onUndo, disabled: !history.canUndo },
      { kind: "button", label: "Redo", icon: icon(Redo2), onPress: history.onRedo, disabled: !history.canRedo },
    ] : [],
    [code],
  ];
  return groups.filter((group) => group.length > 0).flatMap((group, index): PillItem[] => index === 0 ? group : [{ kind: "divider" }, ...group]);
}
