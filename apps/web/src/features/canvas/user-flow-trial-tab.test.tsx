// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestCanvasSession: vi.fn(),
}));

vi.mock("./canvas-session", async () => {
  const actual = await vi.importActual<typeof import("./canvas-session")>("./canvas-session");
  return { ...actual, requestCanvasSession: mocks.requestCanvasSession };
});

vi.mock("./user-flow-trial-canvas", () => ({
  UserFlowTrialCanvas: ({
    roomId,
    access,
  }: {
    roomId: string;
    access: string;
  }) => (
    <p data-testid="mock-canvas">{access}:ws://gateway.example/canvas/{roomId}?ticket=signed</p>
  ),
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
});

describe("UserFlowTrialTab", () => {
  it("renders a connecting state before the ticket resolves", () => {
    mocks.requestCanvasSession.mockReturnValue(new Promise(() => undefined));
    render(<UserFlowTrialTab {...props} />);
    expect(screen.getByTestId("user-flow-trial-loading")).toBeInTheDocument();
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
    render(<UserFlowTrialTab {...props} />);
    expect(await screen.findByTestId("mock-canvas")).toHaveTextContent(
      "view:ws://gateway.example/canvas/40000000-0000-4000-8000-000000000004?ticket=signed",
    );
  });
});
