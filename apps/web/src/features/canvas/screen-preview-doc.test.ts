import { PROTOTYPE_CSP } from "@meld/prototype";
import { describe, expect, it } from "vitest";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import { buildFramePreviewDoc } from "./screen-preview-doc";

const builtScreen: CanvasScreen = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Checkout",
  canvasX: 100,
  canvasY: 200,
  flowNodeId: null,
  state: "built",
  screenKey: null,
  formFactor: "desktop" as const,
  layout: null,
  layoutKey: null,
  layoutName: null,
  preview: {
    markup: "<main>Review order</main>",
    styles: "main { color: var(--color-text-primary); }",
    script: null,
    actions: [],
  },
};

describe("buildFramePreviewDoc", () => {
  it("assembles a validated single-screen preview document", () => {
    const doc = buildFramePreviewDoc(
      builtScreen,
      ":root { --color-text-primary: CanvasText; }",
    );

    expect(doc).toContain(PROTOTYPE_CSP);
    expect(doc).toContain("<main>Review order</main>");
    expect(doc).toContain("--color-text-primary: CanvasText");
  });

  it("includes the design system's component css in the assembled document", () => {
    const doc = buildFramePreviewDoc(builtScreen, ":root{}", ".ds-x{}");

    expect(doc).toContain(".ds-x{}");
  });

  it("omits component css entirely when not provided", () => {
    const doc = buildFramePreviewDoc(builtScreen, ":root{}");

    expect(doc).not.toBeNull();
    expect(doc).not.toContain(".ds-x{}");
  });

  it("returns null for an empty screen regardless of componentCss", () => {
    expect(
      buildFramePreviewDoc(
        { ...builtScreen, state: "empty", preview: null },
        "",
        ".ds-x{}",
      ),
    ).toBeNull();
  });
});
