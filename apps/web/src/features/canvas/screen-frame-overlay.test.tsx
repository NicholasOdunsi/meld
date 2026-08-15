// @vitest-environment jsdom

import { PROTOTYPE_CSP } from "@meld/prototype";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";

const mocks = vi.hoisted(() => ({
  editor: {
    getViewportScreenBounds: vi.fn(() => ({ x: 0, y: 0, w: 1200, h: 800 })),
    getCamera: vi.fn(() => ({ x: 0, y: 0, z: 1 })),
    getCurrentPageShapes: vi.fn(() => [
      {
        id: "shape:screen-empty",
        type: "frame",
        meta: {
          meldScreenId: "22222222-2222-4222-8222-222222222222",
          meldOrphan: undefined as boolean | undefined,
        },
      },
    ]),
    getShapePageBounds: vi.fn(() => ({ x: 10, y: 20, w: 390, h: 844 })),
  },
}));

vi.mock("tldraw", () => ({
  track: (component: unknown) => component,
  useEditor: () => mocks.editor,
}));

import {
  buildFramePreviewDoc,
  ScreenFrameOverlay,
} from "./screen-frame-overlay";

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

beforeEach(() => {
  mocks.editor.getViewportScreenBounds.mockReturnValue({
    x: 0,
    y: 0,
    w: 1200,
    h: 800,
  });
  mocks.editor.getCamera.mockReturnValue({ x: 0, y: 0, z: 1 });
  mocks.editor.getCurrentPageShapes.mockReturnValue([
    {
      id: "shape:screen-empty",
      type: "frame",
      meta: {
        meldScreenId: "22222222-2222-4222-8222-222222222222",
        meldOrphan: undefined,
      },
    },
  ]);
  mocks.editor.getShapePageBounds.mockReturnValue({
    x: 10,
    y: 20,
    w: 390,
    h: 844,
  });
});

afterEach(cleanup);

describe("buildFramePreviewDoc", () => {
  it("assembles a validated single-screen preview document", () => {
    const doc = buildFramePreviewDoc(
      builtScreen,
      ":root { --color-text-primary: CanvasText; }",
    );

    expect(doc).toContain(PROTOTYPE_CSP);
    expect(doc).toContain("<main>Review order</main>");
    expect(doc).toContain("--color-text-primary: CanvasText");
    // `builtScreen.layout` is null -- content-only, no shell to compose.
    expect(doc).not.toContain("data-meld-layout");
  });

  it("composes the resolved shared layout shell into the preview when present", () => {
    const doc = buildFramePreviewDoc(
      {
        ...builtScreen,
        layout: {
          id: "L1",
          shellStyles: "aside { color: red; }",
          shellMarkup:
            '<aside><a data-meld-action="nav-home">Home</a></aside><main data-meld-slot></main>',
          actions: [
            {
              id: "nav-home",
              label: "Home",
              targetScreenId: "22222222-2222-4222-8222-222222222222",
              targetScreenKey: null,
            },
          ],
        },
      },
      ":root { --color-text-primary: CanvasText; }",
    );

    expect(doc).toContain('data-meld-layout="L1"');
    expect(doc).toContain(
      '<main data-meld-slot><main>Review order</main></main>',
    );
    expect(doc).toContain('data-meld-action="layout__nav-home"');
  });

  it("returns null for an empty screen", () => {
    expect(
      buildFramePreviewDoc(
        {
          ...builtScreen,
          state: "empty",
          preview: null,
        },
        "",
      ),
    ).toBeNull();
  });

  it("renders the empty-screen placeholder inside a projected frame", () => {
    render(
      <ScreenFrameOverlay
        screens={[
          {
            ...builtScreen,
            id: "22222222-2222-4222-8222-222222222222",
            state: "empty",
            preview: null,
          },
        ]}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.getByText("Screen not built")).toBeInTheDocument();
    expect(screen.queryByRole("iframe")).not.toBeInTheDocument();
    expect(
      document.querySelector(
        '[data-meld-screen-placeholder="22222222-2222-4222-8222-222222222222"]',
      ),
    ).toHaveStyle({
      width: "390px",
      height: "844px",
      transform: "scale(1)",
      transformOrigin: "top left",
    });
  });

  it("skips duplicate frames after reconciliation marks them orphaned", () => {
    mocks.editor.getCurrentPageShapes.mockReturnValueOnce([
      {
        id: "shape:screen-empty-copy",
        type: "frame",
        meta: {
          meldScreenId: "22222222-2222-4222-8222-222222222222",
          meldOrphan: true,
        },
      },
    ]);

    render(
      <ScreenFrameOverlay
        screens={[
          {
            ...builtScreen,
            id: "22222222-2222-4222-8222-222222222222",
          },
        ]}
        onPreview={vi.fn()}
      />,
    );

    expect(
      screen.queryByTitle("Checkout canvas preview"),
    ).not.toBeInTheDocument();
  });

  it("scales a logical-size preview without changing its iframe viewport", () => {
    mocks.editor.getCamera.mockReturnValue({ x: 0, y: 0, z: 2 });
    mocks.editor.getCurrentPageShapes.mockReturnValue([
      {
        id: "shape:screen-built",
        type: "frame",
        meta: { meldScreenId: builtScreen.id, meldOrphan: undefined },
      },
    ]);

    render(
      <ScreenFrameOverlay screens={[builtScreen]} onPreview={vi.fn()} />,
    );

    const overlay = document.querySelector(
      `[data-meld-screen-overlay="${builtScreen.id}"]`,
    );
    expect(overlay).toHaveStyle({ width: "780px", height: "1688px" });
    expect(screen.getByTitle("Checkout canvas preview")).toHaveStyle({
      width: "390px",
      height: "844px",
      transform: "scale(2)",
      transformOrigin: "top left",
    });
  });
});
