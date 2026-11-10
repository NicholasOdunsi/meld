import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import type { CanvasDocument } from "./document";
import { strokeFromPoints } from "./interaction";

export const fixtureScreens: CanvasScreen[] = [{
  id: "11111111-1111-4111-8111-111111111111", name: "Your next idea", canvasX: 460, canvasY: 60,
  flowNodeId: null, state: "built", screenKey: null, formFactor: "desktop", layout: null,
  layoutKey: null, layoutName: null,
  preview: {
    markup: '<main><small>MADE FOR EXPLORING</small><h1>A little space<br>for your next idea.</h1><p>Collect a reference. Sketch a thought. Make something worth sharing.</p><button>Start exploring →</button><section><h2>Everything starts somewhere.</h2><p>Your ideas belong here.</p></section></main>',
    styles: 'main { padding: var(--spacing-8); font-family: var(--font-family-body); color: var(--color-text-primary); background: var(--color-background-surface); min-height: 100%; } h1 { font-size: var(--font-size-5xl); line-height: 1.1; } p { line-height: 1.6; } small { color: var(--color-text-secondary); } button { padding: var(--spacing-3); background: var(--color-accent); color: var(--color-on-accent); border: none; border-radius: var(--radius-full); } section { margin-top: var(--spacing-12); padding: var(--spacing-6); background: var(--color-background-muted); border-radius: var(--radius-container); }',
    script: null, actions: [],
  },
}];
export const fixtureDocument: CanvasDocument = {version: 1, objects: [
  {id: "idea", kind: "text", x: 60, y: 60, width: 300, height: 70, text: "A place for the next idea.\nSketch first. Make it real."},
  {id: "sketch-box", kind: "rectangle", x: 60, y: 160, width: 280, height: 200},
  strokeFromPoints("sketch-heading", [{x: 85, y: 190}, {x: 240, y: 190}, {x: 220, y: 193}]),
  strokeFromPoints("sketch-copy", [{x: 85, y: 220}, {x: 290, y: 220}, {x: 285, y: 223}]),
  {id: "sketch-button", kind: "rectangle", x: 85, y: 275, width: 120, height: 45},
  {id: "reference", kind: "image", x: 60, y: 410, width: 280, height: 160, assetId: "landscape"},
  {id: "screen", kind: "html-frame", x: 460, y: 60, width: 480, height: 580, screenId: fixtureScreens[0].id},
]};
// Only application-owned assets resolve. Imported documents cannot fetch arbitrary URLs.
export const fixtureAssets: Record<string, string> = { landscape: "/canvas-next-reference.svg" };
