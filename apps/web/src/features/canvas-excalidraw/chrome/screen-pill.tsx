"use client";

import type { ReactNode } from "react";
import { sceneToContainer } from "./selection";

export type PillItem =
  | { kind: "button"; label: string; icon: ReactNode; onPress: () => void; disabled?: boolean; pressed?: boolean; tooltip?: string }
  | { kind: "divider" };

// An action a host adds to a screen's or shape's pill. It has no icon, so the pill shows its label.
export type HostAction = { label: string; onPress: () => void; pressed?: boolean };
export const hostPillItems = (actions: readonly HostAction[]): PillItem[] =>
  actions.map((action) => ({ kind: "button", label: action.label, icon: action.label, onPress: action.onPress, pressed: action.pressed }));

// The floating icon pill under a screen (or a selected shape), in the dock's look. It sits at the
// bottom centre of `bounds` (scene coordinates) and follows the view. Only the pill itself takes
// pointer events, and a press on it never reaches the board, so it neither selects nor deselects.
export function ScreenPill({ bounds, view, items, testId = "selection-pill" }: {
  bounds: { x: number; y: number; width: number; height: number };
  view: { scrollX: number; scrollY: number; zoom: number };
  items: readonly PillItem[];
  testId?: string;
}) {
  if (items.length === 0) return null;
  const anchor = sceneToContainer({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }, view);
  return (
    <section
      className="orion-pill"
      role="toolbar"
      aria-label="Screen actions"
      data-testid={testId}
      style={{ transform: `translate(calc(${anchor.x}px - 50%), calc(${anchor.y}px + var(--orion-i-pill-offset)))` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {items.map((item, index) => item.kind === "divider" ? (
        <hr key={`divider-${index}`} className="orion-pill__divider" aria-orientation="vertical" />
      ) : (
        <button
          key={item.label}
          type="button"
          className={typeof item.icon === "string" ? "orion-pill__btn orion-pill__btn--text" : "orion-pill__btn"}
          aria-label={item.label}
          title={item.tooltip ?? item.label}
          aria-pressed={item.pressed}
          aria-disabled={item.disabled ? "true" : undefined}
          onClick={() => { if (!item.disabled) item.onPress(); }}
        >
          {item.icon}
        </button>
      ))}
    </section>
  );
}
