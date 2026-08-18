// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  startMany: vi.fn(),
  status: "idle" as string,
  isGenerating: false,
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
    startMany: mocks.startMany,
    isGenerating: mocks.isGenerating,
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
import type { CanvasScreenSelection } from "@/features/canvas/use-canvas-selection";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";

const roomId = "40000000-0000-4000-8000-000000000004";
const screenId = "50000000-0000-4000-8000-000000000005";
const otherScreenId = "51000000-0000-4000-8000-000000000051";
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

const twoScreenSelection: CanvasScreenSelection[] = [
  {
    targetScreenId: screenId,
    frame: { x: 0, y: 0, w: 300, h: 900 },
    sketchShapes: [
      { kind: "rectangle", x: 10, y: 10, w: 40, h: 20, text: null },
    ],
  },
  {
    targetScreenId: otherScreenId,
    frame: { x: 400, y: 0, w: 300, h: 900 },
    sketchShapes: [],
  },
];

const twoScreenCanvasScreens = [
  { id: screenId, name: "Login" },
  { id: otherScreenId, name: "Dashboard" },
] as unknown as CanvasScreen[];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = "idle";
  mocks.isGenerating = false;
  mocks.message = null;
  // No prior turns by default -> the empty-state starters show and the
  // composer is exercised without a transcript in the way.
  mocks.listDesignAgentTurns.mockResolvedValue([]);
  mocks.start.mockResolvedValue({ status: "queued" });
  mocks.startMany.mockResolvedValue(undefined);
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
    expect(mocks.startMany).not.toHaveBeenCalled();
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

  it("passes no sketch layout or context when there is no selection", async () => {
    const user = userEvent.setup();
    renderComposer({ selection: [] });

    expect(screen.queryByText(/following your sketch/)).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const call = mocks.start.mock.calls[0]![0];
    expect(call.instruction).toBe("A clean sign in screen");
    expect(call.layout).toBeUndefined();
    expect(call.context).toBeUndefined();
  });

  it("renders a removable chip per selected screen, labelled by screen name", async () => {
    renderComposer({
      selection: twoScreenSelection,
      canvasScreens: twoScreenCanvasScreens,
    });

    expect(await screen.findByText(/Login/)).toBeInTheDocument();
    expect(screen.getByText(/following your sketch \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Dashboard/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /remove Dashboard/i }));

    expect(screen.queryByText(/Dashboard/)).not.toBeInTheDocument();
    expect(screen.getByText(/Login/)).toBeInTheDocument();
  });

  it("fans out one generation per selected screen, each with its own serialized sketch layout", async () => {
    const user = userEvent.setup();
    renderComposer({
      selection: twoScreenSelection,
      canvasScreens: twoScreenCanvasScreens,
    });

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.startMany).toHaveBeenCalledTimes(1);
    const inputs = mocks.startMany.mock.calls[0]![0];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toEqual(
      expect.objectContaining({
        screenId,
        instruction: "A clean sign in screen",
      }),
    );
    expect(inputs[0].layout.boxes).toHaveLength(1);
    expect(inputs[1]).toEqual(
      expect.objectContaining({ screenId: otherScreenId }),
    );
    expect(inputs[1].layout).toBeUndefined();
  });

  it("renders a 'New screen' chip and creates a new screen (no screenId) from a free sketch", async () => {
    const user = userEvent.setup();
    const newScreenSelection: CanvasScreenSelection[] = [
      {
        targetScreenId: null,
        frame: { x: 100, y: 50, w: 160, h: 270 },
        sketchShapes: [
          { kind: "rectangle", x: 100, y: 50, w: 40, h: 40, text: null },
          { kind: "rectangle", x: 200, y: 300, w: 60, h: 20, text: null },
        ],
      },
    ];
    renderComposer({ selection: newScreenSelection, canvasScreens: [] });

    expect(await screen.findByText("New screen")).toBeInTheDocument();
    expect(screen.getByText(/following your sketch \(2\)/)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.startMany).toHaveBeenCalledTimes(1);
    const inputs = mocks.startMany.mock.calls[0]![0];
    expect(inputs).toHaveLength(1);
    expect(inputs[0].screenId).toBeUndefined();
    expect(inputs[0].layout.boxes).toHaveLength(2);
  });

  it("excludes a dismissed screen from the generation fan-out", async () => {
    const user = userEvent.setup();
    renderComposer({
      selection: twoScreenSelection,
      canvasScreens: twoScreenCanvasScreens,
    });

    await user.click(await screen.findByRole("button", { name: /remove Dashboard/i }));
    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const inputs = mocks.startMany.mock.calls[0]![0];
    expect(inputs).toHaveLength(1);
    expect(inputs[0].screenId).toBe(screenId);
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

  it("disables the composer synchronously on submit, so a second click before the fan-out resolves does not double-submit", async () => {
    // A promise that never settles during the test -- keeps `isSubmitting`
    // true across both clicks so the guard is exercised deterministically,
    // rather than racing a mock that resolves on the next microtask.
    let releaseStartMany: (() => void) | undefined;
    mocks.startMany.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseStartMany = resolve;
        }),
    );

    const user = userEvent.setup();
    renderComposer({
      selection: twoScreenSelection,
      canvasScreens: twoScreenCanvasScreens,
    });
    await user.type(screen.getByRole("textbox"), "A clean sign in screen");
    const sendButton = screen.getByRole("button", { name: "Send" });

    fireEvent.click(sendButton);
    // The synchronous `isSubmitting` guard disables the button on the very
    // click that starts the fan-out, before generation.startMany resolves.
    expect(sendButton).toBeDisabled();

    fireEvent.click(sendButton);
    fireEvent.click(sendButton);

    expect(mocks.startMany).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseStartMany?.();
      await Promise.resolve();
    });
  });
});
