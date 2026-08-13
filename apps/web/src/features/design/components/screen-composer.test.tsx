// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  status: "idle" as string,
  message: null as string | null,
  restoreDesignScreenVersion: vi.fn(),
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
}));

import { ScreenComposer } from "./screen-composer";

const roomId = "40000000-0000-4000-8000-000000000004";
const screenId = "50000000-0000-4000-8000-000000000005";
const versionId = "80000000-0000-4000-8000-000000000008";

const builtScreen = {
  id: screenId,
  name: "Sign in",
  state: "built" as const,
  updating: false,
  current_version_id: versionId,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = "idle";
  mocks.message = null;
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

  it("shows Regenerate and Restore for a built screen and wires them up", async () => {
    mocks.restoreDesignScreenVersion.mockResolvedValue({ status: "restored", versionId });
    const user = userEvent.setup();
    render(<ScreenComposer roomId={roomId} access="edit" screens={[builtScreen]} />);

    await user.type(screen.getByRole("textbox"), "Make the button blue");
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(mocks.start).toHaveBeenCalledWith({
      screenId,
      instruction: "Make the button blue",
    });

    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(mocks.restoreDesignScreenVersion).toHaveBeenCalledWith({
      screenId,
      versionId,
    });
    expect(mocks.refresh).toHaveBeenCalled();
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
});
