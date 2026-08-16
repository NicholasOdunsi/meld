// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  status: "idle" as string,
  message: null as string | null,
  listDesignAgentTurns: vi.fn(),
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

vi.mock("../design-agent-transcript", () => ({
  listDesignAgentTurns: mocks.listDesignAgentTurns,
}));

vi.mock("../use-design-profile-distillation", () => ({
  useDesignProfileDistillation: () => ({
    status: "idle",
    message: null,
    upload: vi.fn(),
  }),
}));

import { resolveActionTargets } from "@meld/prototype";
import { ScreenComposer } from "./screen-composer";
import type { CanvasSketchSelection } from "@/features/canvas/use-canvas-selection";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";

const roomId = "40000000-0000-4000-8000-000000000004";
const screenId = "50000000-0000-4000-8000-000000000005";
const currentUserId = "10000000-0000-4000-8000-000000000001";

function renderComposer(
  props: Partial<Parameters<typeof ScreenComposer>[0]> = {},
) {
  return render(
    <ScreenComposer
      roomId={roomId}
      access="edit"
      currentUserId={currentUserId}
      currentUserName="Ada"
      {...props}
    />,
  );
}

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
  // No prior turns by default -> the empty-state starters show and the
  // composer is exercised without a transcript in the way.
  mocks.listDesignAgentTurns.mockResolvedValue([]);
  mocks.start.mockResolvedValue({ status: "queued" });
});

afterEach(cleanup);

describe("ScreenComposer", () => {
  it("hides the composer for viewers", () => {
    renderComposer({ access: "view" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  });

  it("calls start with the typed instruction when Send is clicked", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({ instruction: "A clean sign in screen" }),
    );
  });

  it("disables Send while there is no instruction text", () => {
    renderComposer();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("shows the empty-state starters when there are no turns yet", async () => {
    renderComposer();
    expect(await screen.findByTestId("agents-empty-start")).toBeInTheDocument();
    expect(screen.getByText("Create a prototype")).toBeInTheDocument();
  });

  it("prefills the composer from an empty-state starter row", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.click(await screen.findByText("Create a prototype"));
    expect(screen.getByRole("textbox")).toHaveTextContent("Create a screen for");
  });

  it("renders the transcript instead of the starters once turns exist", async () => {
    mocks.listDesignAgentTurns.mockResolvedValue([
      {
        taskId: "70000000-0000-4000-8000-000000000007",
        screenId,
        screenName: "Sign in",
        userPrompt: "A clean sign in screen",
        initiatedBy: currentUserId,
        taskStatus: "completed",
        screenState: "built",
        currentVersionId: "80000000-0000-4000-8000-000000000008",
        createdAt: "2026-08-17T00:00:00.000Z",
      },
    ]);
    renderComposer();
    expect(await screen.findByTestId("agents-transcript")).toBeInTheDocument();
    expect(screen.queryByTestId("agents-empty-start")).not.toBeInTheDocument();
    expect(screen.getByText("A clean sign in screen")).toBeInTheDocument();
  });

  it("threads the chosen routing's provider and model into start()", async () => {
    const user = userEvent.setup();
    renderComposer({ routing: { provider: "claude", model: "claude-sonnet-5" } });

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: "A clean sign in screen",
        provider: "claude",
        model: "claude-sonnet-5",
      }),
    );
  });

  it("targets the selected frame and serializes the sketch layout", async () => {
    const user = userEvent.setup();
    renderComposer({ selection: sketchSelection });

    expect(screen.getByText(/sketch: 2 shapes/)).toBeVisible();

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const call = mocks.start.mock.calls[0]![0];
    expect(call.screenId).toBe(screenId);
    expect(call.instruction).toBe("A clean sign in screen");
    expect(call.layout.boxes).toHaveLength(2);
  });

  it("passes no sketch layout when there is no selection", async () => {
    const user = userEvent.setup();
    renderComposer({ selection: null });

    expect(screen.queryByText(/sketch:/)).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const call = mocks.start.mock.calls[0]![0];
    expect(call.instruction).toBe("A clean sign in screen");
    expect(call.layout).toBeUndefined();
    expect(call.context).toBeUndefined();
  });

  describe("Generation context", () => {
    const pickPlanScreenId = "51000000-0000-4000-8000-000000000051";
    const keyedCanvasScreens: CanvasScreen[] = [
      {
        id: screenId,
        name: "Sign in",
        canvasX: 0,
        canvasY: 0,
        flowNodeId: null,
        state: "built",
        screenKey: "sign_in",
        formFactor: "desktop" as const,
        layout: null,
        layoutKey: null,
        layoutName: null,
        preview: {
          markup: '<button data-meld-action="go">Go</button>',
          styles: "",
          script: null,
          actions: resolveActionTargets(
            [{ id: "go", label: "Go", targetScreenKey: "pick_plan" }],
            { keyToScreenId: new Map() },
          ),
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
        formFactor: "desktop" as const,
        layout: null,
        layoutKey: null,
        layoutName: null,
        preview: null,
      },
    ];

    it("passes existing-screens and dangling-targets context on Send", async () => {
      const user = userEvent.setup();
      renderComposer({ canvasScreens: keyedCanvasScreens });

      await user.type(screen.getByRole("textbox"), "A pricing screen");
      await user.click(screen.getByRole("button", { name: "Send" }));

      const call = mocks.start.mock.calls[0]![0];
      expect(call.context).toEqual({
        existingScreens: [{ key: "sign_in", name: "Sign in" }],
        danglingTargets: ["pick_plan"],
        existingLayouts: [],
      });
    });

    it("dedupes shared layouts into the existing-layouts context", async () => {
      const layoutCanvasScreens: CanvasScreen[] = [
        {
          id: screenId,
          name: "Sign in",
          canvasX: 0,
          canvasY: 0,
          flowNodeId: null,
          state: "built",
          screenKey: null,
          formFactor: "desktop" as const,
          layout: null,
          layoutKey: "shared_shell",
          layoutName: "Shared shell",
          preview: null,
        },
        {
          id: pickPlanScreenId,
          name: "Pick a plan",
          canvasX: 100,
          canvasY: 0,
          flowNodeId: null,
          state: "built",
          screenKey: null,
          formFactor: "desktop" as const,
          layout: null,
          layoutKey: "shared_shell",
          layoutName: "Shared shell",
          preview: null,
        },
      ];
      const user = userEvent.setup();
      renderComposer({ canvasScreens: layoutCanvasScreens });

      await user.type(screen.getByRole("textbox"), "A pricing screen");
      await user.click(screen.getByRole("button", { name: "Send" }));

      const call = mocks.start.mock.calls[0]![0];
      expect(call.context).toEqual({
        existingScreens: [],
        danglingTargets: [],
        existingLayouts: [{ key: "shared_shell", name: "Shared shell" }],
      });
    });

    it("surfaces a shared layout's unowned nav target as a dangling target", async () => {
      const layoutNavCanvasScreens: CanvasScreen[] = [
        {
          id: screenId,
          name: "Dashboard",
          canvasX: 0,
          canvasY: 0,
          flowNodeId: null,
          state: "built",
          screenKey: "dashboard",
          formFactor: "desktop" as const,
          layoutKey: "app_shell",
          layoutName: "App shell",
          layout: {
            id: "layout-1",
            shellMarkup: "<aside></aside>",
            shellStyles: "",
            actions: resolveActionTargets(
              [
                { id: "nav-vehicle-pool", label: "Vehicle pool", targetScreenKey: "vehicle_pool" },
                { id: "nav-dashboard", label: "Dashboard", targetScreenKey: "dashboard" },
              ],
              { keyToScreenId: new Map() },
            ),
          },
          preview: null,
        },
      ];
      const user = userEvent.setup();
      renderComposer({ canvasScreens: layoutNavCanvasScreens });

      await user.type(screen.getByRole("textbox"), "A vehicle pool screen");
      await user.click(screen.getByRole("button", { name: "Send" }));

      const call = mocks.start.mock.calls[0]![0];
      expect(call.context.danglingTargets).toContain("vehicle_pool");
      expect(call.context.danglingTargets).not.toContain("dashboard");
    });
  });

  it("re-reads the transcript after a generation is queued", async () => {
    const user = userEvent.setup();
    renderComposer();
    await waitFor(() => expect(mocks.listDesignAgentTurns).toHaveBeenCalled());
    const callsBefore = mocks.listDesignAgentTurns.mock.calls.length;

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(mocks.listDesignAgentTurns.mock.calls.length).toBeGreaterThan(
        callsBefore,
      ),
    );
  });
});
