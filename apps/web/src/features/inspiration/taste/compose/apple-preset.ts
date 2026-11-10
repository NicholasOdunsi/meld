import { type TasteBoard, type TasteComposerCard } from "@meld/contracts";
import { filterComposerCards } from "./taste-interpreter";

const SOURCE = { kind: "preset", name: "Apple Human Interface Guidelines", locator: "" } as const;
const card = (c: Omit<TasteComposerCard, "source">): TasteComposerCard =>
  ({ ...c, source: { ...SOURCE, locator: c.tile } }) as TasteComposerCard;

/** "Make it feel like Apple": a few ordinary cards, no AI call, never written until kept. */
export function appleTasteCards(board: TasteBoard, rejectedKeys: string[]): TasteComposerCard[] {
  const cards: TasteComposerCard[] = [
    card({
      tile: "typography",
      op: "set",
      value: { weight: "regular", tracking: "normal", note: board.typography.note },
      reason: "Apple avoids thin type and keeps lettering readable",
    }),
    card({ tile: "spacing", op: "set", value: "generous", reason: "Apple gives content room to breathe" }),
    card({ tile: "density", op: "set", value: "balanced", reason: "Apple keeps screens uncluttered but useful" }),
    card({
      tile: "layoutHabits",
      op: "add",
      value: "Most important content at the top and leading edge",
      reason: "Apple puts the most important things first",
    }),
  ];
  return filterComposerCards(cards, board, rejectedKeys);
}
