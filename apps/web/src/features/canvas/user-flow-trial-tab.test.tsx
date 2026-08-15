// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestCanvasSession: vi.fn(),
  canvasProps: null as Record<string, unknown> | null,
}));

vi.mock("./canvas-session", async () => {
  const actual = await vi.importActual<typeof import("./canvas-session")>("./canvas-session");
  return { ...actual, requestCanvasSession: mocks.requestCanvasSession };
});

vi.mock("./user-flow-trial-canvas", () => ({
  UserFlowTrialCanvas: (props: Record<string, unknown>) => {
    mocks.canvasProps = props;
    return (
      <p data-testid="mock-canvas">
        {String(props.access)}:ws://gateway.example/canvas/{String(props.roomId)}?ticket=signed
      </p>
    );
  },
}));

import { UserFlowTrialTab } from "./user-flow-trial-tab";

const props = {
  workspaceId: "30000000-0000-4000-8000-000000000003",
  roomId: "40000000-0000-4000-8000-000000000004",
  currentUser: { id: "10000000-0000-4000-8000-000000000001", name: "Owner" },
  access: "edit" as const,
  trialEnabled: true,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.canvasProps = null;
});

describe("UserFlowTrialTab", () => {
  it("does not request a gateway session while the trial is unavailable", () => {
    render(<UserFlowTrialTab {...props} trialEnabled={false} />);
    expect(screen.getByTestId("user-flow-trial-unavailable")).toBeInTheDocument();
    expect(mocks.requestCanvasSession).not.toHaveBeenCalled();
  });

  it("renders a connecting state before the ticket resolves", () => {
    mocks.requestCanvasSession.mockReturnValue(new Promise(() => undefined));
    render(
      <UserFlowTrialTab
        {...props}
        initialGenerationTaskId="70000000-0000-4000-8000-000000000009"
      />,
    );
    const loading = screen.getByTestId("user-flow-trial-loading");
    expect(loading).toHaveAttribute("data-generating", "true");
    expect(loading.className).toContain("glow");
  });

  it("renders an actionable error for an unavailable session", async () => {
    const { CanvasSessionError } = await import("./canvas-session");
    mocks.requestCanvasSession.mockRejectedValue(
      new CanvasSessionError(503, "The trial is unavailable."),
    );
    render(<UserFlowTrialTab {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("user-flow-trial-error")).toBeInTheDocument(),
    );
    expect(screen.getByText("The trial is unavailable.")).toBeInTheDocument();
  });

  it("mounts the canvas with the signed gateway room URI", async () => {
    mocks.requestCanvasSession.mockResolvedValue({
      ticket: "signed",
      gatewayUrl: "ws://gateway.example",
      access: "view",
      expiresAt: 100,
    });
    render(
      <UserFlowTrialTab
        {...props}
        initialGenerationTaskId="70000000-0000-4000-8000-000000000009"
      />,
    );
    expect(await screen.findByTestId("mock-canvas")).toHaveTextContent(
      "view:ws://gateway.example/canvas/40000000-0000-4000-8000-000000000004?ticket=signed",
    );
    expect(mocks.canvasProps).toMatchObject({
      initialGenerationTaskId: "70000000-0000-4000-8000-000000000009",
    });
  });

  it("threads canvas screens to the synced canvas", async () => {
    const canvasScreens = [
      {
        id: "50000000-0000-4000-8000-000000000005",
        name: "Checkout",
        canvasX: 120,
        canvasY: 240,
        flowNodeId: null,
        state: "empty" as const,
        screenKey: null,
        preview: null,
      },
    ];
    mocks.requestCanvasSession.mockResolvedValue({
      ticket: "signed",
      gatewayUrl: "ws://gateway.example",
      access: "edit",
      expiresAt: 100,
    });

    render(
      <UserFlowTrialTab
        {...props}
        canvasScreens={canvasScreens}
        canvasScreensAuthoritative={false}
      />,
    );

    await screen.findByTestId("mock-canvas");
    expect(mocks.canvasProps?.canvasScreens).toBe(canvasScreens);
    expect(mocks.canvasProps?.canvasScreensAuthoritative).toBe(false);
  });
});
