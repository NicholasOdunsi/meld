// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScreenThumbnailState } from "@/features/design/use-screen-thumbnail";

const mocks = vi.hoisted(() => ({
  useScreenThumbnail: vi.fn(),
}));

vi.mock("@/features/design/use-screen-thumbnail", () => ({
  useScreenThumbnail: mocks.useScreenThumbnail,
}));

import { AgentsTranscript } from "./agents-transcript";
import type { DesignAgentTurn } from "../design-agent-transcript";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";

const currentUserId = "10000000-0000-4000-8000-000000000001";
const taskId = "70000000-0000-4000-8000-000000000007";
const builtScreenId = "50000000-0000-4000-8000-000000000005";

const builtCanvasScreen: CanvasScreen = {
  id: builtScreenId,
  name: "Sign in",
  canvasX: 0,
  canvasY: 0,
  flowNodeId: null,
  state: "built",
  screenKey: null,
  formFactor: "desktop" as const,
  layout: null,
  layoutKey: null,
  layoutName: null,
  preview: {
    markup: "<main>Sign in</main>",
    styles: "main { color: var(--color-text-primary); }",
    script: null,
    actions: [],
  },
};

function turn(overrides: Partial<DesignAgentTurn> = {}): DesignAgentTurn {
  return {
    taskId,
    screenId: "50000000-0000-4000-8000-000000000005",
    screenName: "Sign in",
    userPrompt: "A clean sign in screen",
    initiatedBy: currentUserId,
    taskStatus: "completed",
    screenState: "built",
    currentVersionId: "80000000-0000-4000-8000-000000000008",
    createdAt: "2026-08-17T00:00:00.000Z",
    editedExisting: false,
    screens: [
      {
        id: "50000000-0000-4000-8000-000000000005",
        name: "Sign in",
        state: "built",
        currentVersionId: "80000000-0000-4000-8000-000000000008",
      },
    ],
    ...overrides,
  };
}

function mockThumbnailState(state: ScreenThumbnailState) {
  mocks.useScreenThumbnail.mockReturnValue({
    state,
    containerRef: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
  mocks.useScreenThumbnail.mockReset();
});

describe("AgentsTranscript", () => {
  it("shows the user's prompt attributed to them and the design agent's reply", () => {
    mockThumbnailState({ status: "idle" });
    render(
      <AgentsTranscript
        turns={[turn()]}
        currentUserId={currentUserId}
        currentUserName="Ada"
      />,
    );
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("A clean sign in screen")).toBeInTheDocument();
    expect(screen.getByText("Design Agent")).toBeInTheDocument();
    expect(screen.getByText(/Here.s the Sign in screen/)).toBeInTheDocument();
  });

  it("shows a thinking state while the generation is running", () => {
    render(
      <AgentsTranscript
        turns={[turn({ taskStatus: "running", screenState: "empty", currentVersionId: null })]}
        currentUserId={currentUserId}
        currentUserName="Ada"
      />,
    );
    expect(screen.getByText(/Designing your screen/)).toBeInTheDocument();
    expect(screen.queryByText(/Built/)).not.toBeInTheDocument();
  });

  it("shows a failure line when the generation failed", () => {
    render(
      <AgentsTranscript
        turns={[turn({ taskStatus: "failed", screenState: "empty", currentVersionId: null })]}
        currentUserId={currentUserId}
        currentUserName="Ada"
      />,
    );
    expect(screen.getByText(/didn’t come through/)).toBeInTheDocument();
  });

  it("falls back to a View button when the canvas has no preview for the screen", () => {
    const onPreview = vi.fn();
    render(
      <AgentsTranscript
        turns={[turn()]}
        currentUserId={currentUserId}
        currentUserName="Ada"
        onPreview={onPreview}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View Sign in" }));
    expect(onPreview).toHaveBeenCalledWith(builtScreenId);
    // No screen at all in this turn -- ScreenThumbnail never mounts, so the
    // hook is never invoked and no iframe is ever rendered.
    expect(document.querySelector("iframe")).not.toBeInTheDocument();
  });

  it("renders a captured thumbnail image when the capture is ready", () => {
    mockThumbnailState({ status: "ready", src: "data:image/png;base64,AAA" });
    const onPreview = vi.fn();
    render(
      <AgentsTranscript
        turns={[turn()]}
        currentUserId={currentUserId}
        currentUserName="Ada"
        canvasScreens={[builtCanvasScreen]}
        tokenCss=":root{--color-text-primary:CanvasText}"
        onPreview={onPreview}
      />,
    );
    const thumbnail = screen.getByTestId(`agents-thumbnail-${builtScreenId}`);
    expect(thumbnail).toBeInTheDocument();
    const img = thumbnail.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAA");
    // The thumbnail replaces the plain View button.
    expect(screen.queryByRole("button", { name: "View Sign in" })).not.toBeInTheDocument();
    expect(document.querySelector("iframe")).not.toBeInTheDocument();
    fireEvent.click(thumbnail);
    expect(onPreview).toHaveBeenCalledWith(builtScreenId);
  });

  it.each(["idle", "capturing"] as const)(
    "renders a skeleton (not an image or iframe) while the capture is %s",
    (status) => {
      mockThumbnailState({ status });
      render(
        <AgentsTranscript
          turns={[turn()]}
          currentUserId={currentUserId}
          currentUserName="Ada"
          canvasScreens={[builtCanvasScreen]}
          tokenCss=":root{--color-text-primary:CanvasText}"
          onPreview={vi.fn()}
        />,
      );
      const thumbnail = screen.getByTestId(`agents-thumbnail-${builtScreenId}`);
      expect(thumbnail.querySelector("img")).not.toBeInTheDocument();
      expect(thumbnail.querySelector("iframe")).not.toBeInTheDocument();
      // The Skeleton component renders `aria-hidden="true"` on its root.
      expect(thumbnail.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    },
  );

  it("degrades to the View button when the capture errors", () => {
    mockThumbnailState({ status: "error" });
    const onPreview = vi.fn();
    render(
      <AgentsTranscript
        turns={[turn()]}
        currentUserId={currentUserId}
        currentUserName="Ada"
        canvasScreens={[builtCanvasScreen]}
        tokenCss=":root{--color-text-primary:CanvasText}"
        onPreview={onPreview}
      />,
    );
    expect(
      screen.queryByTestId(`agents-thumbnail-${builtScreenId}`),
    ).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "View Sign in" });
    fireEvent.click(button);
    expect(onPreview).toHaveBeenCalledWith(builtScreenId);
    expect(document.querySelector("iframe")).not.toBeInTheDocument();
  });

  it("degrades to the View button when the screen has no safe preview doc", () => {
    mockThumbnailState({ status: "idle" });
    const onPreview = vi.fn();
    // A screen with no preview markup -- buildFramePreviewDoc returns null,
    // so ScreenThumbnail's `doc` memo is null.
    const unsafeScreen: CanvasScreen = {
      ...builtCanvasScreen,
      preview: null,
    };
    render(
      <AgentsTranscript
        turns={[turn()]}
        currentUserId={currentUserId}
        currentUserName="Ada"
        canvasScreens={[unsafeScreen]}
        tokenCss=":root{--color-text-primary:CanvasText}"
        onPreview={onPreview}
      />,
    );
    expect(
      screen.queryByTestId(`agents-thumbnail-${builtScreenId}`),
    ).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "View Sign in" });
    fireEvent.click(button);
    expect(onPreview).toHaveBeenCalledWith(builtScreenId);
    expect(document.querySelector("iframe")).not.toBeInTheDocument();
  });

  it("attributes another member's prompt to a teammate, not the current user", () => {
    render(
      <AgentsTranscript
        turns={[turn({ initiatedBy: "20000000-0000-4000-8000-000000000002" })]}
        currentUserId={currentUserId}
        currentUserName="Ada"
      />,
    );
    expect(screen.getByText("Teammate")).toBeInTheDocument();
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
  });
});
