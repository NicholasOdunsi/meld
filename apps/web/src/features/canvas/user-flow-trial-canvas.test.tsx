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
  historyDrawerProps: null as Record<string, unknown> | null,
  routerPush: vi.fn(),
  seedDesignScreensFromFlow: vi.fn(),
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
    return <p data-testid="mock-screen-composer">composer</p>;
  },
}));

vi.mock("@/features/design/components/history-drawer", () => ({
  HistoryDrawer: (props: Record<string, unknown>) => {
    mocks.historyDrawerProps = props;
    return props.open ? <p data-testid="mock-history-drawer">history</p> : null;
  },
}));

vi.mock("@/features/design/seed-design-screens", () => ({
  seedDesignScreensFromFlow: mocks.seedDesignScreensFromFlow,
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
  mocks.historyDrawerProps = null;
  mocks.seedDesignScreensFromFlow.mockResolvedValue([]);
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

  it("follows the OS color scheme so the canvas matches the app theme", () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
    };
    render(<UserFlowTrialCanvas {...props} />);

    (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    expect(editor.user.updateUserPreferences).toHaveBeenCalledWith({
      colorScheme: "system",
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
        preview: null,
      },
      {
        id: projectedScreenId,
        name: "Existing",
        canvasX: 600,
        canvasY: 240,
        flowNodeId: null,
        state: "empty" as const,
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

  it("mounts the screen overlay and routes global and per-screen previews", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const canvasScreens = [
      {
        id: "50000000-0000-4000-8000-000000000005",
        name: "Checkout",
        canvasX: 120,
        canvasY: 240,
        flowNodeId: null,
        state: "empty" as const,
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

    fireEvent.click(
      screen.getByRole("button", { name: /Preview prototype$/ }),
    );
    (mocks.overlayProps?.onPreview as (screenId: string) => void)(
      canvasScreens[0].id,
    );
    expect(mocks.routerPush).toHaveBeenNthCalledWith(1, "?tab=prototype");
    expect(mocks.routerPush).toHaveBeenNthCalledWith(2, "?tab=prototype");
  });

  it("mounts the sketch-aware composer for an editor and feeds it the canvas selection", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const screenId = "50000000-0000-4000-8000-000000000005";
    const frameShape = {
      id: "shape:screen-frame-1",
      type: "frame",
      meta: { meldScreenId: screenId },
      props: {},
    };
    const sketchRectShape = {
      id: "shape:sketch-rect",
      type: "geo",
      meta: {},
      props: { geo: "rectangle" },
    };
    const bounds: Record<string, { x: number; y: number; w: number; h: number }> = {
      "shape:screen-frame-1": { x: 0, y: 0, w: 300, h: 800 },
      "shape:sketch-rect": { x: 20, y: 20, w: 100, h: 40 },
    };
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
      getCurrentPageShapes: vi.fn().mockReturnValue([frameShape, sketchRectShape]),
      getSelectedShapes: vi.fn().mockReturnValue([frameShape]),
      getShapePageBounds: vi.fn((id: string) => bounds[id] ?? null),
    };
    const screens = [
      {
        id: screenId,
        name: "Sign in",
        state: "empty" as const,
        updating: false,
        current_version_id: null,
      },
    ];

    render(
      <UserFlowTrialCanvas
        {...props}
        access="edit"
        canvasScreensAuthoritative={false}
        screens={screens}
      />,
    );

    await act(async () => {
      (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    });

    expect(screen.getByTestId("mock-screen-composer")).toBeInTheDocument();
    expect(mocks.composerProps?.roomId).toBe(props.roomId);
    expect(mocks.composerProps?.access).toBe("edit");
    expect(mocks.composerProps?.screens).toBe(screens);
    expect(mocks.composerProps?.selection).toEqual({
      targetScreenId: screenId,
      sketchShapes: [
        { kind: "rectangle", x: 20, y: 20, w: 100, h: 40, text: null },
      ],
      frame: { x: 0, y: 0, w: 300, h: 800 },
    });
  });

  it("hides the canvas composer for view access", () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    render(<UserFlowTrialCanvas {...props} access="view" />);
    expect(screen.queryByTestId("mock-screen-composer")).not.toBeInTheDocument();
  });

  it("toggles the History drawer open and closed from the History control", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    render(<UserFlowTrialCanvas {...props} />);

    expect(mocks.historyDrawerProps?.open).toBe(false);
    expect(screen.queryByTestId("mock-history-drawer")).not.toBeInTheDocument();

    // astryx's Button runs `clickAction` inside a `startTransition`, so the
    // resulting state flip lands a tick after the synchronous click.
    fireEvent.click(screen.getByText("History"));
    await waitFor(() => expect(mocks.historyDrawerProps?.open).toBe(true));
    expect(screen.getByTestId("mock-history-drawer")).toBeInTheDocument();

    await act(async () => {
      (mocks.historyDrawerProps?.onClose as () => void)();
    });
    await waitFor(() => expect(mocks.historyDrawerProps?.open).toBe(false));
  });

  it("feeds the History drawer the room id and the canvas selection's screen id", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const screenId = "50000000-0000-4000-8000-000000000005";
    const frameShape = {
      id: "shape:screen-frame-1",
      type: "frame",
      meta: { meldScreenId: screenId },
      props: {},
    };
    const bounds: Record<string, { x: number; y: number; w: number; h: number }> = {
      "shape:screen-frame-1": { x: 0, y: 0, w: 300, h: 800 },
    };
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
      user: { updateUserPreferences: vi.fn() },
      getCurrentPageShapes: vi.fn().mockReturnValue([frameShape]),
      getSelectedShapes: vi.fn().mockReturnValue([frameShape]),
      getShapePageBounds: vi.fn((id: string) => bounds[id] ?? null),
    };

    render(<UserFlowTrialCanvas {...props} />);

    expect(mocks.historyDrawerProps?.roomId).toBe(props.roomId);
    expect(mocks.historyDrawerProps?.selectedScreenId).toBeNull();

    await act(async () => {
      (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    });

    expect(mocks.historyDrawerProps?.selectedScreenId).toBe(screenId);
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

  it("seeds design screens once from the flow's unscreened action nodes", async () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    render(
      <UserFlowTrialCanvas
        {...props}
        access="edit"
        seedFlow={seedFlowWithOneAction}
        canvasScreens={[]}
      />,
    );

    await waitFor(() =>
      expect(mocks.seedDesignScreensFromFlow).toHaveBeenCalledTimes(1),
    );
    expect(mocks.seedDesignScreensFromFlow).toHaveBeenCalledWith({
      roomId: props.roomId,
      seeds: [{ nodeId: "checkout", name: "Checkout", x: 0, y: 1200 }],
    });
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
            preview: null,
          },
        ]}
      />,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.seedDesignScreensFromFlow).not.toHaveBeenCalled();
  });
});
