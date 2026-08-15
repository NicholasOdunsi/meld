// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  status: "idle" as string,
  message: null as string | null,
  restoreDesignScreenVersion: vi.fn(),
  listDesignScreenVersions: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../use-design-screen-generation", () => ({
  useDesignScreenGeneration: () => ({
    status: mocks.status,
    taskId: null,
    message: mocks.message,
    start: mocks.start,
  }),
}));

vi.mock("../design-screen-generation", () => ({
  restoreDesignScreenVersion: mocks.restoreDesignScreenVersion,
  listDesignScreenVersions: mocks.listDesignScreenVersions,
}));

import { ScreenComposer } from "./screen-composer";
import type { CanvasSketchSelection } from "@/features/canvas/use-canvas-selection";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import type { FlowDocument } from "@meld/contracts";

const roomId = "40000000-0000-4000-8000-000000000004";
const screenId = "50000000-0000-4000-8000-000000000005";
const versionId = "80000000-0000-4000-8000-000000000008";
const priorVersionId = "90000000-0000-4000-8000-000000000009";

const builtScreen = {
  id: screenId,
  name: "Sign in",
  state: "built" as const,
  updating: false,
  current_version_id: versionId,
};

const sketchSelection: CanvasSketchSelection = {
  targetScreenId: screenId,
  sketchShapes: [
    { kind: "rectangle", x: 10, y: 10, w: 40, h: 20, text: null },
    { kind: "text", x: 10, y: 40, w: 40, h: 10, text: "Email" },
  ],
  frame: { x: 0, y: 0, w: 100, h: 100 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = "idle";
  mocks.message = null;
  mocks.listDesignScreenVersions.mockResolvedValue([]);
});

afterEach(cleanup);

describe("ScreenComposer", () => {
  it("hides the composer input from viewers", () => {
    render(<ScreenComposer roomId={roomId} access="view" screens={[]} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate" })).not.toBeInTheDocument();
  });

  it("calls start with the typed instruction when Generate is clicked", async () => {
    const user = userEvent.setup();
    render(<ScreenComposer roomId={roomId} access="edit" screens={[]} />);

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(mocks.start).toHaveBeenCalledWith({ instruction: "A clean sign in screen" });
  });

  it("disables Generate while there is no instruction text", () => {
    render(<ScreenComposer roomId={roomId} access="edit" screens={[]} />);
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
  });

  it("shows a loading state on the Generate button while a task is running", () => {
    mocks.status = "running";
    render(<ScreenComposer roomId={roomId} access="edit" screens={[]} />);
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(screen.getByText("Building screen")).toBeVisible();
  });

  it("shows a per-screen state line for each screen", () => {
    render(
      <ScreenComposer
        roomId={roomId}
        access="edit"
        screens={[
          builtScreen,
          { id: "60000000-0000-4000-8000-000000000006", name: "Dashboard", state: "empty", updating: false, current_version_id: null },
        ]}
      />,
    );
    expect(screen.getByText(/Sign in/)).toBeVisible();
    expect(screen.getByText(/built/i)).toBeVisible();
    expect(screen.getByText(/Dashboard/)).toBeVisible();
    expect(screen.getByText(/empty/i)).toBeVisible();
  });

  it("shows Regenerate for a built screen and wires it up", async () => {
    const user = userEvent.setup();
    render(<ScreenComposer roomId={roomId} access="edit" screens={[builtScreen]} />);

    await user.type(screen.getByRole("textbox"), "Make the button blue");
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(mocks.start).toHaveBeenCalledWith({
      screenId,
      instruction: "Make the button blue",
    });
  });

  it("offers Restore only for a prior version, never the current version", async () => {
    mocks.listDesignScreenVersions.mockResolvedValue([
      { id: versionId, createdAt: "2026-08-14T00:00:00Z", promoted: true },
      { id: priorVersionId, createdAt: "2026-08-10T00:00:00Z", promoted: true },
    ]);
    mocks.restoreDesignScreenVersion.mockResolvedValue({
      status: "restored",
      versionId: priorVersionId,
    });
    const user = userEvent.setup();
    render(<ScreenComposer roomId={roomId} access="edit" screens={[builtScreen]} />);

    const restoreButtons = await screen.findAllByRole("button", { name: "Restore" });
    expect(restoreButtons).toHaveLength(1);

    await user.click(restoreButtons[0]);
    expect(mocks.restoreDesignScreenVersion).toHaveBeenCalledWith({
      screenId,
      versionId: priorVersionId,
    });
    expect(mocks.restoreDesignScreenVersion).not.toHaveBeenCalledWith(
      expect.objectContaining({ versionId }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows no Restore action when a built screen has no prior versions", async () => {
    mocks.listDesignScreenVersions.mockResolvedValue([
      { id: versionId, createdAt: "2026-08-14T00:00:00Z", promoted: true },
    ]);
    render(<ScreenComposer roomId={roomId} access="edit" screens={[builtScreen]} />);

    await screen.findByRole("button", { name: "Regenerate" });
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("does not show Regenerate or Restore for a screen that is still building", () => {
    render(
      <ScreenComposer
        roomId={roomId}
        access="edit"
        screens={[{ ...builtScreen, updating: true }]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("shows a sketch indicator and targets the selected frame when a sketch selection is present", async () => {
    const user = userEvent.setup();
    render(
      <ScreenComposer
        roomId={roomId}
        access="edit"
        screens={[]}
        selection={sketchSelection}
      />,
    );

    expect(screen.getByText(/sketch: 2 shapes/)).toBeVisible();

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(mocks.start).toHaveBeenCalledTimes(1);
    const call = mocks.start.mock.calls[0]![0];
    expect(call.screenId).toBe(screenId);
    expect(call.instruction).toBe("A clean sign in screen");
    expect(call.layout.boxes).toHaveLength(2);
  });

  it("has no sketch indicator and passes no layout when there is no selection", async () => {
    const user = userEvent.setup();
    render(<ScreenComposer roomId={roomId} access="edit" screens={[]} selection={null} />);

    expect(screen.queryByText(/sketch:/)).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(mocks.start).toHaveBeenCalledWith({ instruction: "A clean sign in screen" });
  });

  const flowWithDownstreamStep: FlowDocument = {
    title: "Journey",
    summary: "Journey",
    nodes: [
      { id: "start", kind: "start", label: "Start", detail: null },
      { id: "sign_in", kind: "action", label: "Sign in", detail: null },
      { id: "pick_plan", kind: "action", label: "Pick a plan", detail: null },
    ],
    edges: [
      { id: "e0", from: "start", to: "sign_in", label: null },
      { id: "e1", from: "sign_in", to: "pick_plan", label: "Continue" },
    ],
    openQuestions: [],
  };
  const canvasScreensWithFlowNode: CanvasScreen[] = [
    {
      id: screenId,
      name: "Sign in",
      canvasX: 0,
      canvasY: 0,
      flowNodeId: "sign_in",
      state: "empty",
      screenKey: null,
      preview: null,
    },
  ];

  it("passes the selected screen's downstream journey steps to start() on Generate", async () => {
    const user = userEvent.setup();
    render(
      <ScreenComposer
        roomId={roomId}
        access="edit"
        screens={[]}
        selection={sketchSelection}
        flow={flowWithDownstreamStep}
        canvasScreens={canvasScreensWithFlowNode}
      />,
    );

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(mocks.start).toHaveBeenCalledTimes(1);
    const call = mocks.start.mock.calls[0]![0];
    expect(call.steps).toEqual([{ nodeId: "pick_plan", label: "Continue" }]);
  });

  it("passes the built screen's downstream journey steps to start() on Regenerate", async () => {
    const user = userEvent.setup();
    render(
      <ScreenComposer
        roomId={roomId}
        access="edit"
        screens={[builtScreen]}
        flow={flowWithDownstreamStep}
        canvasScreens={canvasScreensWithFlowNode}
      />,
    );

    await user.type(screen.getByRole("textbox"), "Make the button blue");
    await user.click(screen.getByRole("button", { name: "Regenerate" }));

    expect(mocks.start).toHaveBeenCalledWith({
      screenId,
      instruction: "Make the button blue",
      layout: undefined,
      steps: [{ nodeId: "pick_plan", label: "Continue" }],
    });
  });

  it("passes no steps when the selected screen has no downstream journey step", async () => {
    const user = userEvent.setup();
    render(
      <ScreenComposer
        roomId={roomId}
        access="edit"
        screens={[]}
        selection={sketchSelection}
      />,
    );

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    const call = mocks.start.mock.calls[0]![0];
    expect(call.steps).toBeUndefined();
  });

  const pickPlanScreenId = "51000000-0000-4000-8000-000000000051";

  describe("Generation context", () => {
    const keyedCanvasScreens: CanvasScreen[] = [
      {
        id: screenId,
        name: "Sign in",
        canvasX: 0,
        canvasY: 0,
        flowNodeId: null,
        state: "built",
        screenKey: "sign_in",
        preview: {
          markup: "<button data-meld-action=\"go\">Go</button>",
          styles: "",
          script: null,
          actions: [{ id: "go", label: "Go", targetScreenKey: "pick_plan", targetScreenId: null }],
        },
      },
      {
        id: pickPlanScreenId,
        name: "Pick a plan",
        canvasX: 100,
        canvasY: 0,
        flowNodeId: null,
        state: "empty",
        screenKey: null,
        preview: null,
      },
    ];

    it("renders no Build buttons for the retired T1 affordance", () => {
      render(
        <ScreenComposer
          roomId={roomId}
          access="edit"
          screens={[]}
          selection={sketchSelection}
          canvasScreens={keyedCanvasScreens}
        />,
      );

      expect(screen.queryByTestId("build-next-steps")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Build .+ →$/ })).not.toBeInTheDocument();
    });

    it("passes no context to start() when canvasScreens has no keyed screens or dangling targets", async () => {
      const user = userEvent.setup();
      render(<ScreenComposer roomId={roomId} access="edit" screens={[]} />);

      await user.type(screen.getByRole("textbox"), "A clean sign in screen");
      await user.click(screen.getByRole("button", { name: "Generate" }));

      expect(mocks.start).toHaveBeenCalledWith({ instruction: "A clean sign in screen" });
    });

    it("passes existing-screens and dangling-targets context derived from canvasScreens to start() on Generate", async () => {
      const user = userEvent.setup();
      render(
        <ScreenComposer
          roomId={roomId}
          access="edit"
          screens={[]}
          canvasScreens={keyedCanvasScreens}
        />,
      );

      await user.type(screen.getByRole("textbox"), "A pricing screen");
      await user.click(screen.getByRole("button", { name: "Generate" }));

      expect(mocks.start).toHaveBeenCalledTimes(1);
      const call = mocks.start.mock.calls[0]![0];
      expect(call.context).toEqual({
        existingScreens: [{ key: "sign_in", name: "Sign in" }],
        danglingTargets: ["pick_plan"],
      });
    });

    it("passes the same generation context derived from canvasScreens to start() on Regenerate", async () => {
      const user = userEvent.setup();
      render(
        <ScreenComposer
          roomId={roomId}
          access="edit"
          screens={[builtScreen]}
          canvasScreens={keyedCanvasScreens}
        />,
      );

      await user.type(screen.getByRole("textbox"), "Make the button blue");
      await user.click(screen.getByRole("button", { name: "Regenerate" }));

      expect(mocks.start).toHaveBeenCalledWith({
        screenId,
        instruction: "Make the button blue",
        layout: undefined,
        steps: undefined,
        context: {
          existingScreens: [{ key: "sign_in", name: "Sign in" }],
          danglingTargets: ["pick_plan"],
        },
      });
    });
  });
});
