"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { PILL_LAYOUT } from "../live/inspector-theme";
import { clampPill } from "./clamp-pill";
import { sceneToContainer } from "./selection";

export type PillItem =
  | { kind: "button"; label: string; icon: ReactNode; onPress: () => void; disabled?: boolean; pressed?: boolean; tooltip?: string; text?: boolean }
  | { kind: "divider" };

// An action a host adds to a screen's or shape's pill. It has no icon, so the pill shows its label.
export type HostAction = { label: string; onPress: () => void; pressed?: boolean };
export const hostPillItems = (actions: readonly HostAction[]): PillItem[] =>
  actions.map((action) => ({ kind: "button", label: action.label, icon: action.label, text: true, onPress: action.onPress, pressed: action.pressed }));

// The floating icon pill under a screen (or a selected shape), in the dock's look. It sits at the
// bottom centre of `bounds` (scene coordinates) and follows the view, but stays inside the visible
// board: pinned above the bottom edge when the frame runs off it, kept clear of the dock and the
// edges, and not drawn at all while the frame is out of view. Only the pill itself takes pointer
// events, and a press on it never reaches the board or takes focus from the screen or the panel.
export function ScreenPill({ bounds, view, items, label, testId }: {
  bounds: { x: number; y: number; width: number; height: number };
  // width/height are the board's visible size; without them (not measured yet) the pill is not clamped.
  view: { scrollX: number; scrollY: number; zoom: number; width?: number; height?: number };
  items: readonly PillItem[];
  label: string;
  testId?: string;
}) {
  // The element, once it is in the DOM (it is not while the frame is out of view).
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Measured before paint, and again whenever its size changes (a different set of buttons).
  useLayoutEffect(() => {
    if (!node) return;
    const measure = () => setSize((current) => (current.w === node.offsetWidth && current.h === node.offsetHeight ? current : { w: node.offsetWidth, h: node.offsetHeight }));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  // Browser zoom (pinch or ctrl+wheel) over the pill would zoom the whole page; the board owns zoom.
  useEffect(() => {
    if (!node) return;
    const stop = (event: Event) => { if (!(event instanceof WheelEvent) || event.ctrlKey) event.preventDefault(); };
    node.addEventListener("wheel", stop, { passive: false });
    node.addEventListener("gesturestart", stop);
    node.addEventListener("gesturechange", stop);
    return () => {
      node.removeEventListener("wheel", stop);
      node.removeEventListener("gesturestart", stop);
      node.removeEventListener("gesturechange", stop);
    };
  }, [node]);
  if (items.length === 0) return null;
  const anchor = sceneToContainer({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }, view);
  let place = { x: anchor.x, y: anchor.y + PILL_LAYOUT.gap };
  if (view.width && view.height) {
    const topLeft = sceneToContainer({ x: bounds.x, y: bounds.y }, view);
    const clamped = clampPill({
      anchor, pill: size, viewport: { w: view.width, h: view.height }, ...PILL_LAYOUT,
      frame: { left: topLeft.x, top: topLeft.y, right: topLeft.x + bounds.width * view.zoom, bottom: anchor.y },
    });
    if (!clamped) return null;
    place = clamped;
  }
  return (
    <section
      ref={setNode}
      className="orion-pill"
      role="group"
      aria-label={label}
      data-testid={testId}
      style={{ transform: `translate(calc(${place.x}px - 50%), ${place.y}px)` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {items.map((item, index) => item.kind === "divider" ? (
        <hr key={index} className="orion-pill__divider" aria-orientation="vertical" />
      ) : (
        <button
          key={index}
          type="button"
          className={item.text ? "orion-pill__btn orion-pill__btn--text" : "orion-pill__btn"}
          aria-label={item.label}
          title={item.tooltip ?? item.label}
          aria-pressed={item.pressed}
          aria-disabled={item.disabled ? "true" : undefined}
          // A mouse press must not move focus off the screen or a panel field; the keyboard still activates it.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { if (!item.disabled) item.onPress(); }}
        >
          {item.icon}
        </button>
      ))}
    </section>
  );
}
