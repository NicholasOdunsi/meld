// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom's Blob (which File extends) implements only slice/size/type in this
// project's jsdom version -- arrayBuffer() is simply absent, unlike a real
// browser. DesignSystemBanner's upload path calls file.arrayBuffer(), so the
// design-system-banner test below needs it; FileReader.readAsArrayBuffer is
// the one jsdom does implement, so it backs the polyfill.
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

const mocks = vi.hoisted(() => ({
  requestCanvasSession: vi.fn(),
  useSync: vi.fn(),
  tldrawProps: null as Record<string, unknown> | null,
  generationOptions: null as null | {
    onGenerationReady?: (generation: unknown) => void | Promise<void>;
    initialTaskId?: string | null;
  },
  markUserFlowGenerationApplied: vi.fn(),
  generationStatus: "idle" as string,
  overlayProps: null as Record<string, unknown> | null,
  composerProps: null as Record<string, unknown> | null,
  routerPush: vi.fn(),
  seedDesignScreensFromFlow: vi.fn(),
  getActiveDesignProfile: vi.fn(),
  uploadDesignSystemDocument: vi.fn(),
  getDesignProfileDistillation: vi.fn(),
  deleteDesignScreen: vi.fn(),
  restoreDesignScreen: vi.fn(),
}));

vi.mock("next/navigation", () => {
  const router = { push: mocks.routerPush };
  return { useRouter: () => router };
});

vi.mock("./canvas-session", async () => {
  const actual = await vi.importActual<typeof import("./canvas-session")>("./canvas-session");
  return { ...actual, requestCanvasSession: mocks.requestCanvasSession };
});

vi.mock("@tldraw/sync", () => ({
  useSync: mocks.useSync,
}));

vi.mock("./use-user-flow-generation", () => ({
  useUserFlowGeneration: (options: typeof mocks.generationOptions) => {
    mocks.generationOptions = options;
    return {
      status: mocks.generationStatus,
      taskId: null,
      message: null,
      start: vi.fn(),
    };
  },
}));

vi.mock("./user-flow-generation", () => ({
  markUserFlowGenerationApplied: mocks.markUserFlowGenerationApplied,
}));

vi.mock("./screen-frame-overlay", () => ({
  ScreenFrameOverlay: (props: Record<string, unknown>) => {
    mocks.overlayProps = props;
    return <p data-testid="mock-screen-frame-overlay">overlay</p>;
  },
}));

vi.mock("@/features/design/components/screen-composer", () => ({
  ScreenComposer: (props: Record<string, unknown>) => {
    mocks.composerProps = props;
    return (
      <p data-testid="mock-screen-composer">
        composer
        {props.banner as React.ReactNode}
      </p>
    );
  },
}));

vi.mock("@/features/design/seed-design-screens", () => ({
  seedDesignScreensFromFlow: mocks.seedDesignScreensFromFlow,
}));

vi.mock("@/features/design/design-profile-reader", () => ({
  getActiveDesignProfile: mocks.getActiveDesignProfile,
}));

vi.mock("@/features/design/design-screen-delete", () => ({
  deleteDesignScreen: mocks.deleteDesignScreen,
  restoreDesignScreen: mocks.restoreDesignScreen,
}));

// The banner and its useDesignProfileDistillation hook are used for real here
// (not mocked) so the onResolved wiring in this component is exercised
// end-to-end -- only their two server-action calls are stubbed, the same way
// use-design-profile-distillation.test.ts stubs them for the hook alone.
vi.mock("@/features/design/design-profile-distillation", () => ({
  uploadDesignSystemDocument: mocks.uploadDesignSystemDocument,
  getDesignProfileDistillation: mocks.getDesignProfileDistillation,
}));

vi.mock("tldraw", () => ({
  computed: (_name: string, fn: () => unknown) => ({ get: fn }),
  createUserId: (value: string) => `user:${value}`,
  getIndexAbove: () => "a2",
  getIndicesAbove: (_index: unknown, count: number) =>
    Array.from({ length: count }, (_, index) => `a${index + 1}`),
  inlineBase64AssetStore: {},
  UserRecordType: { create: (value: unknown) => value },
  // Non-reactive stand-in: evaluates the selector immediately rather than
  // subscribing to the store. Sufficient here since no test depends on the
  // selection changing after mount without a rerender.
  useValue: (_name: string, fn: () => unknown) => fn(),
  Tldraw: (props: Record<string, unknown>) => {
    mocks.tldrawProps = props;
    return <p data-testid="mock-tldraw">canvas</p>;
  },
}));

import { UserFlowTrialCanvas } from "./user-flow-trial-canvas";
import { SCREEN_FRAME_COLOR } from "./screen-frame-reconcile";

const initialSession = {
  ticket: "first-ticket",
  gatewayUrl: "wss://gateway.example",
  access: "view" as const,
  expiresAt: 100,
};

const props = {
  workspaceId: "30000000-0000-4000-8000-000000000003",
  roomId: "40000000-0000-4000-8000-000000000004",
  userId: "10000000-0000-4000-8000-000000000001",
  userName: "Viewer",
  access: "view" as const,
  trialEnabled: true,
};

beforeEach(() => {
  mocks.useSync.mockReturnValue({ status: "loading" });
  mocks.requestCanvasSession.mockResolvedValue({
    ...initialSession,
    ticket: "renewed-ticket",
  });
  mocks.markUserFlowGenerationApplied.mockResolvedValue(true);
  mocks.generationStatus = "idle";
  mocks.overlayProps = null;
  mocks.composerProps = null;
  mocks.seedDesignScreensFromFlow.mockResolvedValue([]);
  mocks.getActiveDesignProfile.mockResolvedValue({ hasActiveProfile: false });
  mocks.deleteDesignScreen.mockReset().mockResolvedValue({ status: "deleted" });
  mocks.restoreDesignScreen.mockReset().mockResolvedValue({ status: "restored" });
  mocks.uploadDesignSystemDocument.mockReset();
  mocks.getDesignProfileDistillation.mockReset();
  process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY = "trial-license";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete window.__MELD_TLDRAW_TRIAL_EDITOR__;
  delete process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;
});

describe("UserFlowTrialCanvas", () => {
  it("renders loading and error states from useSync", () => {
    render(<UserFlowTrialCanvas {...props} />);
    expect(screen.getByTestId("user-flow-trial-canvas-loading")).toBeInTheDocument();

    cleanup();
    mocks.useSync.mockReturnValue({ status: "error", error: new Error("offline") });
    render(<UserFlowTrialCanvas {...props} />);
    expect(screen.getByTestId("user-flow-trial-canvas-error")).toBeInTheDocument();
  });

  it("keeps the pink edge while the generating canvas is syncing", () => {
    mocks.useSync.mockReturnValue({ status: "loading" });
    mocks.generationStatus = "running";
    render(
      <UserFlowTrialCanvas
        {...props}
        initialGenerationTaskId="70000000-0000-4000-8000-000000000009"
      />,
    );

    const loading = screen.getByTestId("user-flow-trial-canvas-loading");
    expect(loading).toHaveAttribute("data-generating", "true");
    expect(loading.className).toContain("glow");
  });

  it("passes the license and read-only guard while exposing the trial editor", () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
    };
    render(<UserFlowTrialCanvas {...props} />);

    const host = screen.getByTestId("user-flow-editor-host");
    expect(host).toHaveAttribute("data-size", "fill");
    expect(host).toHaveStyle({
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    });
    expect(mocks.tldrawProps).toMatchObject({
      hideUi: false,
      licenseKey: "trial-license",
    });
    (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    expect(editor.updateInstanceState).toHaveBeenCalledWith({ isReadonly: true });
    expect(window.__MELD_TLDRAW_TRIAL_EDITOR__).toBe(editor);
  });

  it("pins the canvas to light so it matches the app theme", () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
    };
    render(<UserFlowTrialCanvas {...props} />);

    (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    expect(editor.user.updateUserPreferences).toHaveBeenCalledWith({
      colorScheme: "light",
    });
  });

  it("shows the dot grid by default on mount", () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
    };
    render(<UserFlowTrialCanvas {...props} />);

    (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    expect(editor.updateInstanceState).toHaveBeenCalledWith({ isGridMode: true });
  });

  it("keeps tldraw's bottom-left navigation panel while the top-left cluster stays off", () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    render(<UserFlowTrialCanvas {...props} />);

    const components = mocks.tldrawProps?.components as Record<string, unknown>;
    // Top-left is still the Room toolbar's corner, so tldraw's own cluster
    // there stays off -- null is how tldraw is told to render nothing.
    expect(components.MainMenu).toBeNull();
    expect(components.PageMenu).toBeNull();
    // The zoom readout and its menu sit bottom-left, where the Room puts
    // nothing (the dock is bottom-centre and its gutter ignores pointers), so
    // tldraw keeps its default: the key is absent rather than nulled.
    expect(components).not.toHaveProperty("NavigationPanel");
  });

  it.each(["queued", "running"])(
    "marks the editor host as generating while a user flow is %s",
    (status) => {
      mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
      mocks.generationStatus = status;
      render(<UserFlowTrialCanvas {...props} />);

      expect(screen.getByTestId("user-flow-editor-host")).toHaveAttribute(
        "data-generating",
        "true",
      );
    },
  );

  it("starts from the server-provided generation task", () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    render(
      <UserFlowTrialCanvas
        {...props}
        initialGenerationTaskId="70000000-0000-4000-8000-000000000009"
      />,
    );

    expect(mocks.generationOptions?.initialTaskId).toBe(
      "70000000-0000-4000-8000-000000000009",
    );
  });

  it.each(["idle", "completed", "failed", "needs_context"])(
    "does not mark the editor host as generating while status is %s",
    (status) => {
      mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
      mocks.generationStatus = status;
      render(<UserFlowTrialCanvas {...props} />);

      expect(screen.getByTestId("user-flow-editor-host")).toHaveAttribute(
        "data-generating",
        "false",
      );
    },
  );

  it.each(["queued", "running"])(
    "keeps the pink generation edge while status is %s",
    (status) => {
      mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
      mocks.generationStatus = status;
      render(<UserFlowTrialCanvas {...props} />);

      expect(screen.getByTestId("user-flow-editor-host").className).toContain(
        "glow",
      );
    },
  );

  it.each(["idle", "completed", "failed", "needs_context"])(
    "removes the pink generation edge while status is %s",
    (status) => {
      mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
      mocks.generationStatus = status;
      render(<UserFlowTrialCanvas {...props} />);

      expect(screen.getByTestId("user-flow-editor-host").className).not.toContain(
        "glow",
      );
    },
  );

  it("renews the signed URI for reconnects", async () => {
    mocks.useSync.mockReturnValue({ status: "loading" });
    render(<UserFlowTrialCanvas {...props} />);
    const uri = mocks.useSync.mock.calls[0]?.[0]?.uri as () => Promise<string>;

    await expect(uri()).resolves.toBe(
      "wss://gateway.example/canvas/40000000-0000-4000-8000-000000000004?ticket=renewed-ticket",
    );
    await expect(uri()).resolves.toBe(
      "wss://gateway.example/canvas/40000000-0000-4000-8000-000000000004?ticket=renewed-ticket",
    );
    expect(mocks.requestCanvasSession).toHaveBeenCalledTimes(2);
  });

  it("applies a recovered generation after editor mount and then acknowledges it", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const stored: unknown[] = [];
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
      getCurrentPageBounds: vi.fn().mockReturnValue(undefined),
      getCurrentPageId: vi.fn().mockReturnValue("page:page"),
      getHighestIndexForParent: vi.fn().mockReturnValue("a1"),
      getCurrentPageShapes: vi.fn().mockReturnValue([]),
      getShape: vi.fn((id: string) => stored.find(
        (record) => typeof record === "object" && record !== null && "id" in record && record.id === id,
      )),
      run: vi.fn((callback: () => void) => callback()),
      store: { put: vi.fn((records: unknown[]) => stored.push(...records)) },
      zoomToBounds: vi.fn(),
    };
    render(<UserFlowTrialCanvas {...props} access="edit" />);
    const generation = {
      taskId: "70000000-0000-4000-8000-000000000007",
      roomId: props.roomId,
      createdAt: "2026-08-10T12:00:00.000Z",
      document: {
        title: "Recovery",
        summary: "Restore access",
        nodes: [
          { id: "start", kind: "start", label: "Start", detail: null },
          { id: "end", kind: "end", label: "Done", detail: null },
        ],
        edges: [{ id: "e1", from: "start", to: "end", label: null }],
        openQuestions: ["Which recovery channel is preferred?"],
      },
      applicationMode: "replace",
    };

    let delivery: Promise<void> | void;
    await act(async () => {
      delivery = mocks.generationOptions?.onGenerationReady?.(generation);
      await Promise.resolve();
    });
    expect(editor.store.put).not.toHaveBeenCalled();

    await act(async () => {
      (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
      await delivery;
    });
    await waitFor(() => expect(editor.store.put).toHaveBeenCalledTimes(1));
    expect(stored).toEqual(expect.arrayContaining([
      expect.objectContaining({ typeName: "binding", type: "arrow" }),
      expect.objectContaining({ typeName: "shape", type: "note" }),
    ]));
    expect(mocks.markUserFlowGenerationApplied).toHaveBeenCalledWith(generation.taskId);
  });

  it("projects screens and marks orphan and duplicate frames after remote sync with edit access", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const orphan = {
      id: "shape:screen-gone",
      typeName: "shape",
      type: "frame",
      x: 0,
      y: 0,
      rotation: 0,
      index: "a1",
      parentId: "page:page",
      isLocked: false,
      opacity: 1,
      props: { w: 390, h: 844, name: "Gone", color: SCREEN_FRAME_COLOR },
      meta: { meldScreenId: "gone" },
    };
    const projectedScreenId = "50000000-0000-4000-8000-000000000006";
    const projected = {
      ...orphan,
      id: "shape:screen-existing",
      props: { ...orphan.props, name: "Existing" },
      meta: { meldScreenId: projectedScreenId },
    };
    const duplicate = {
      ...projected,
      id: "shape:screen-existing-copy",
      index: "a2",
    };
    const put = vi.fn();
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
      getCurrentPageShapes: vi.fn().mockReturnValue([
        orphan,
        projected,
        duplicate,
      ]),
      getCurrentPageId: vi.fn().mockReturnValue("page:page"),
      getHighestIndexForParent: vi.fn().mockReturnValue("a1"),
      run: vi.fn((callback: () => void) => callback()),
      store: { put, listen: vi.fn(() => vi.fn()) },
    };
    const canvasScreens = [
      {
        id: "50000000-0000-4000-8000-000000000005",
        name: "Checkout",
        canvasX: 120,
        canvasY: 240,
        flowNodeId: null,
        state: "empty" as const,
        screenKey: null,
        formFactor: "mobile" as const,
        layout: null,
        layoutKey: null,
        layoutName: null,
        preview: null,
      },
      {
        id: projectedScreenId,
        name: "Existing",
        canvasX: 600,
        canvasY: 240,
        flowNodeId: null,
        state: "empty" as const,
        screenKey: null,
        formFactor: "mobile" as const,
        layout: null,
        layoutKey: null,
        layoutName: null,
        preview: null,
      },
    ];
    const view = render(
      <UserFlowTrialCanvas
        {...props}
        access="edit"
        canvasScreens={canvasScreens}
      />,
    );

    await act(async () => {
      (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    });

    await waitFor(() => expect(put).toHaveBeenCalledTimes(3));
    expect(put).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({
        typeName: "shape",
        type: "frame",
        x: 120,
        y: 240,
        parentId: "page:page",
        index: "a2",
        meta: { meldScreenId: canvasScreens[0].id },
      }),
    ]);
    expect(put).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        id: orphan.id,
        meta: { meldScreenId: "gone", meldOrphan: true },
      }),
    ]);
    expect(put).toHaveBeenNthCalledWith(3, [
      expect.objectContaining({
        id: duplicate.id,
        meta: { meldScreenId: projectedScreenId, meldOrphan: true },
      }),
    ]);

    view.rerender(
      <UserFlowTrialCanvas
        {...props}
        access="edit"
        canvasScreens={canvasScreens}
      />,
    );
    expect(put).toHaveBeenCalledTimes(3);
  });

  it("persists a user's frame deletion so the screen isn't reprojected, and excludes it locally right away", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const deletedScreenId = "50000000-0000-4000-8000-000000000007";
    const frame = {
      id: "shape:screen-deleted",
      typeName: "shape",
      type: "frame",
      x: 0,
      y: 0,
      rotation: 0,
      index: "a1",
      parentId: "page:page",
      isLocked: false,
      opacity: 1,
      props: { w: 390, h: 844, name: "Deleted", color: SCREEN_FRAME_COLOR },
      meta: { meldScreenId: deletedScreenId },
    };
    const put = vi.fn();
    const listeners: Array<(entry: unknown) => void> = [];
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
      getCurrentPageShapes: vi.fn().mockReturnValue([frame]),
      getCurrentPageId: vi.fn().mockReturnValue("page:page"),
      getHighestIndexForParent: vi.fn().mockReturnValue("a1"),
      run: vi.fn((callback: () => void) => callback()),
      store: {
        put,
        listen: vi.fn((callback: (entry: unknown) => void) => {
          listeners.push(callback);
          return vi.fn();
        }),
      },
    };
    const canvasScreens = [
      {
        id: deletedScreenId,
        name: "Deleted",
        canvasX: 120,
        canvasY: 240,
        flowNodeId: null,
        state: "empty" as const,
        screenKey: null,
        formFactor: "mobile" as const,
        layout: null,
        layoutKey: null,
        layoutName: null,
        preview: null,
      },
    ];

    render(
      <UserFlowTrialCanvas {...props} access="edit" canvasScreens={canvasScreens} />,
    );
    await act(async () => {
      (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    });

    // The screen's frame already exists on the canvas, so the initial
    // reconcile is a no-op (nothing to create).
    await waitFor(() => expect(editor.getCurrentPageShapes).toHaveBeenCalled());
    expect(put).not.toHaveBeenCalled();

    // Rendering the overlay layer (as tldraw itself would) surfaces the
    // screens it was fed -- ScreenFrameOverlay's `screens` prop mirrors
    // effectiveCanvasScreens, the source reconcileScreenFrames reads from.
    function overlayScreenIds() {
      const components = mocks.tldrawProps?.components as {
        InFrontOfTheCanvas: () => React.ReactNode;
      };
      render(<>{components.InFrontOfTheCanvas()}</>);
      return (mocks.overlayProps?.screens as Array<{ id: string }>).map(
        (s) => s.id,
      );
    }
    expect(overlayScreenIds()).toEqual([deletedScreenId]);

    // The user deletes the frame (Delete/Backspace, context menu, ...): tldraw
    // reports it as a removed shape via the store listener, source "user".
    const screenFrameListener = listeners[listeners.length - 1];
    act(() => {
      screenFrameListener({
        source: "user",
        changes: { added: {}, updated: {}, removed: { [frame.id]: frame } },
      });
    });

    // Persisted: deleteDesignScreen is called with the screen id.
    expect(mocks.deleteDesignScreen).toHaveBeenCalledWith(deletedScreenId);
    // Excluded locally right away, without waiting on a server round-trip --
    // the regression this covers: reconcileScreenFrames must never see this
    // screen's row again, or it would recreate the very frame just deleted.
    expect(overlayScreenIds()).toEqual([]);

    // The user hits ctrl/cmd+Z: tldraw's own undo stack restores the exact
    // frame shape it removed, reported as an added shape with the same
    // meldScreenId, source "user".
    act(() => {
      screenFrameListener({
        source: "user",
        changes: { added: { [frame.id]: frame }, updated: {}, removed: {} },
      });
    });

    // Undone server-side too: restoreDesignScreen is called, and the screen
    // is projected again without waiting on a server round-trip.
    expect(mocks.restoreDesignScreen).toHaveBeenCalledWith(deletedScreenId);
    expect(overlayScreenIds()).toEqual([deletedScreenId]);
  });

  it("does not re-seed a flow node whose screen the user just deleted", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const seededScreenId = "50000000-0000-4000-8000-000000000011";
    const frame = {
      id: "shape:screen-seeded",
      typeName: "shape",
      type: "frame",
      x: 0,
      y: 1200,
      rotation: 0,
      index: "a1",
      parentId: "page:page",
      isLocked: false,
      opacity: 1,
      props: { w: 390, h: 844, name: "Checkout", color: SCREEN_FRAME_COLOR },
      meta: { meldScreenId: seededScreenId },
    };
    const listeners: Array<(entry: unknown) => void> = [];
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
      getCurrentPageShapes: vi.fn().mockReturnValue([frame]),
      // Non-empty, so the journey-flow seeder leaves the board alone and this
      // test only exercises the screen seeder.
      getCurrentPageShapeIds: vi.fn().mockReturnValue(new Set([frame.id])),
      getCurrentPageId: vi.fn().mockReturnValue("page:page"),
      getHighestIndexForParent: vi.fn().mockReturnValue("a1"),
      run: vi.fn((callback: () => void) => callback()),
      store: {
        put: vi.fn(),
        listen: vi.fn((callback: (entry: unknown) => void) => {
          listeners.push(callback);
          return vi.fn();
        }),
      },
    };

    render(
      <UserFlowTrialCanvas
        {...props}
        access="edit"
        seedFlow={seedFlowWithOneAction}
        canvasScreens={[
          {
            id: seededScreenId,
            name: "Checkout",
            canvasX: 0,
            canvasY: 1200,
            flowNodeId: "checkout",
            state: "empty" as const,
            screenKey: null,
            formFactor: "mobile" as const,
            layout: null,
            layoutKey: null,
            layoutName: null,
            preview: null,
          },
        ]}
      />,
    );
    await act(async () => {
      (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    });

    // The node already has a screen, so nothing is seeded on arrival.
    expect(mocks.seedDesignScreensFromFlow).not.toHaveBeenCalled();

    // The user deletes the seeded screen's frame.
    const screenFrameListener = listeners[listeners.length - 1];
    await act(async () => {
      screenFrameListener({
        source: "user",
        changes: { added: {}, updated: {}, removed: { [frame.id]: frame } },
      });
    });
    expect(mocks.deleteDesignScreen).toHaveBeenCalledWith(seededScreenId);

    // Deleting hides the screen from the projection so the frame isn't
    // recreated -- but that must not make "checkout" look unseeded and hand it
    // straight back to the seeder, which would resurrect it under a new id.
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.seedDesignScreensFromFlow).not.toHaveBeenCalled();
  });

  it("does not treat an ordinary newly-created frame as a restore", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const newScreenId = "50000000-0000-4000-8000-000000000009";
    const frame = {
      id: "shape:screen-new",
      typeName: "shape",
      type: "frame",
      x: 0,
      y: 0,
      rotation: 0,
      index: "a1",
      parentId: "page:page",
      isLocked: false,
      opacity: 1,
      props: { w: 390, h: 844, name: "New", color: SCREEN_FRAME_COLOR },
      meta: { meldScreenId: newScreenId },
    };
    const listeners: Array<(entry: unknown) => void> = [];
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
      getCurrentPageShapes: vi.fn().mockReturnValue([]),
      getCurrentPageId: vi.fn().mockReturnValue("page:page"),
      getHighestIndexForParent: vi.fn().mockReturnValue("a1"),
      run: vi.fn((callback: () => void) => callback()),
      store: {
        put: vi.fn(),
        listen: vi.fn((callback: (entry: unknown) => void) => {
          listeners.push(callback);
          return vi.fn();
        }),
      },
    };

    render(<UserFlowTrialCanvas {...props} access="edit" />);
    await act(async () => {
      (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    });

    const screenFrameListener = listeners[listeners.length - 1];
    act(() => {
      screenFrameListener({
        source: "user",
        changes: { added: { [frame.id]: frame }, updated: {}, removed: {} },
      });
    });

    expect(mocks.restoreDesignScreen).not.toHaveBeenCalled();
  });

  it("waits for remote sync before projecting screens for an editor", async () => {
    let storeStatus = "synced-local";
    mocks.useSync.mockImplementation(() => ({ status: storeStatus, store: {} }));
    const put = vi.fn();
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
      getCurrentPageShapes: vi.fn().mockReturnValue([]),
      getCurrentPageId: vi.fn().mockReturnValue("page:page"),
      getHighestIndexForParent: vi.fn().mockReturnValue("a1"),
      run: vi.fn((callback: () => void) => callback()),
      store: { put, listen: vi.fn(() => vi.fn()) },
    };
    const canvasScreens = [
      {
        id: "50000000-0000-4000-8000-000000000005",
        name: "Checkout",
        canvasX: 120,
        canvasY: 240,
        flowNodeId: null,
        state: "empty" as const,
        screenKey: null,
        formFactor: "mobile" as const,
        layout: null,
        layoutKey: null,
        layoutName: null,
        preview: null,
      },
    ];
    const view = render(
      <UserFlowTrialCanvas
        {...props}
        access="edit"
        canvasScreens={canvasScreens}
      />,
    );

    await act(async () => {
      (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    });
    await Promise.resolve();
    expect(editor.run).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();

    storeStatus = "synced-remote";
    view.rerender(
      <UserFlowTrialCanvas
        {...props}
        access="edit"
        canvasScreens={canvasScreens}
      />,
    );

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith([
      expect.objectContaining({
        type: "frame",
        meta: { meldScreenId: canvasScreens[0].id },
      }),
    ]);
  });

  it("never writes screen projections for view access", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const put = vi.fn();
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
      getCurrentPageShapes: vi.fn().mockReturnValue([]),
      getCurrentPageId: vi.fn().mockReturnValue("page:page"),
      getHighestIndexForParent: vi.fn().mockReturnValue("a1"),
      run: vi.fn((callback: () => void) => callback()),
      store: { put, listen: vi.fn(() => vi.fn()) },
    };

    render(
      <UserFlowTrialCanvas
        {...props}
        canvasScreens={[
          {
            id: "50000000-0000-4000-8000-000000000005",
            name: "Checkout",
            canvasX: 120,
            canvasY: 240,
            flowNodeId: null,
            state: "empty" as const,
            screenKey: null,
            formFactor: "mobile" as const,
            layout: null,
            layoutKey: null,
            layoutName: null,
            preview: null,
          },
        ]}
      />,
    );

    await act(async () => {
      (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    });
    await Promise.resolve();

    expect(editor.run).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("waits for an authoritative screen read and clears a recovered keeper marker", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const screenId = "50000000-0000-4000-8000-000000000005";
    const recoveredFrame = {
      id: "shape:screen-existing",
      typeName: "shape",
      type: "frame",
      x: 120,
      y: 240,
      rotation: 0,
      index: "a1",
      parentId: "page:page",
      isLocked: false,
      opacity: 1,
      props: {
        w: 390,
        h: 844,
        name: "Checkout",
        color: SCREEN_FRAME_COLOR,
      },
      meta: { meldScreenId: screenId, meldOrphan: true },
    };
    const put = vi.fn();
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
      getCurrentPageShapes: vi.fn().mockReturnValue([recoveredFrame]),
      getCurrentPageId: vi.fn().mockReturnValue("page:page"),
      getHighestIndexForParent: vi.fn().mockReturnValue("a1"),
      run: vi.fn((callback: () => void) => callback()),
      store: { put, listen: vi.fn(() => vi.fn()) },
    };
    const canvasScreens = [
      {
        id: screenId,
        name: "Checkout",
        canvasX: 120,
        canvasY: 240,
        flowNodeId: null,
        state: "empty" as const,
        screenKey: null,
        formFactor: "mobile" as const,
        layout: null,
        layoutKey: null,
        layoutName: null,
        preview: null,
      },
    ];
    const view = render(
      <UserFlowTrialCanvas
        {...props}
        access="edit"
        canvasScreens={canvasScreens}
        canvasScreensAuthoritative={false}
      />,
    );

    await act(async () => {
      (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    });
    await Promise.resolve();
    expect(editor.run).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();

    view.rerender(
      <UserFlowTrialCanvas
        {...props}
        access="edit"
        canvasScreens={canvasScreens}
        canvasScreensAuthoritative
      />,
    );

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith([
      expect.objectContaining({
        id: recoveredFrame.id,
        meta: { meldScreenId: screenId },
      }),
    ]);
  });

  it("mounts the screen overlay and routes per-screen previews", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const canvasScreens = [
      {
        id: "50000000-0000-4000-8000-000000000005",
        name: "Checkout",
        canvasX: 120,
        canvasY: 240,
        flowNodeId: null,
        state: "empty" as const,
        screenKey: null,
        formFactor: "mobile" as const,
        layout: null,
        layoutKey: null,
        layoutName: null,
        preview: null,
      },
    ];
    const view = render(
      <UserFlowTrialCanvas {...props} canvasScreens={canvasScreens} />,
    );

    const components = mocks.tldrawProps?.components as {
      InFrontOfTheCanvas: () => React.ReactNode;
    };
    view.rerender(
      <UserFlowTrialCanvas {...props} canvasScreens={canvasScreens} />,
    );
    expect(mocks.tldrawProps?.components).toBe(components);
    render(<>{components.InFrontOfTheCanvas()}</>);
    // effectiveCanvasScreens re-derives a fresh array from the server prop (and
    // any seeded rows), so identity isn't preserved -- only contents.
    expect(mocks.overlayProps?.screens).toEqual(canvasScreens);

    (mocks.overlayProps?.onPreview as (screenId: string) => void)(
      canvasScreens[0].id,
    );
    expect(mocks.routerPush).toHaveBeenNthCalledWith(
      1,
      `?tab=prototype&screen=${canvasScreens[0].id}`,
    );
  });


  it("hides the canvas composer for view access", () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    render(<UserFlowTrialCanvas {...props} access="view" />);
    expect(screen.queryByTestId("mock-screen-composer")).not.toBeInTheDocument();
  });




  const seedFlowWithOneAction = {
    title: "Checkout flow",
    summary: "Buy a plan",
    nodes: [
      { id: "start", kind: "start" as const, label: "Start", detail: null },
      { id: "checkout", kind: "action" as const, label: "Checkout", detail: null },
      { id: "end", kind: "end" as const, label: "Done", detail: null },
    ],
    edges: [],
    openQuestions: [],
  };

  it("never creates screens on its own from the flow", async () => {
    // Opening the Canvas used to mint one empty screen per action node, so a
    // twelve-step flow became twelve blank frames nobody asked for. Screens are
    // now only ever created when someone asks for one.
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    render(
      <UserFlowTrialCanvas
        {...props}
        access="edit"
        seedFlow={seedFlowWithOneAction}
        canvasScreens={[]}
      />,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.seedDesignScreensFromFlow).not.toHaveBeenCalled();
  });

  it("does not seed a design screen for an action node that already has one", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    render(
      <UserFlowTrialCanvas
        {...props}
        access="edit"
        seedFlow={seedFlowWithOneAction}
        canvasScreens={[
          {
            id: "50000000-0000-4000-8000-000000000005",
            name: "Checkout",
            canvasX: 0,
            canvasY: 1200,
            flowNodeId: "checkout",
            state: "empty" as const,
            screenKey: null,
            formFactor: "mobile" as const,
            layout: null,
            layoutKey: null,
            layoutName: null,
            preview: null,
          },
        ]}
      />,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.seedDesignScreensFromFlow).not.toHaveBeenCalled();
  });

  describe("design-system profile banner", () => {


    it("passes the active profile's token CSS to the canvas screen overlay", async () => {
      mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
      mocks.getActiveDesignProfile.mockResolvedValue({
        hasActiveProfile: true,
        tokenCss: ":root{--ds-brand:rebeccapurple}",
      });
      render(<UserFlowTrialCanvas {...props} access="edit" />);
      await waitFor(() =>
        expect(mocks.getActiveDesignProfile).toHaveBeenCalled(),
      );
      // Flush the profile promise so its tokenCss lands in component state and
      // re-derives the InFrontOfTheCanvas layer.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const components = mocks.tldrawProps?.components as {
        InFrontOfTheCanvas: () => React.ReactNode;
      };
      const view = render(<>{components.InFrontOfTheCanvas()}</>);
      expect(mocks.overlayProps?.tokenCss).toBe(":root{--ds-brand:rebeccapurple}");
      view.unmount();
    });

    it("never shows the banner for view-only access, even without an active profile", async () => {
      mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
      render(<UserFlowTrialCanvas {...props} access="view" />);
      await waitFor(() => expect(mocks.getActiveDesignProfile).toHaveBeenCalled());
      expect(screen.queryByTestId("design-system-banner")).not.toBeInTheDocument();
    });

  });
});
