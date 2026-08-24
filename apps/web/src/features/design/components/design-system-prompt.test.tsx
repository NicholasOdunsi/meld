// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveDesignProfile: vi.fn(),
  // The banner's "a distill finished" callback, captured so a test can fire it.
  notifyResolved: null as null | (() => void | Promise<void>),
  roomStatuses: [] as { taskId: string; kind: string; status: string }[],
}));
vi.mock("../design-profile-reader", () => ({
  getActiveDesignProfile: mocks.getActiveDesignProfile,
}));
vi.mock("@/features/prd/components/room-task-status-provider", () => ({
  useRoomTaskStatus: () => ({ statuses: mocks.roomStatuses }),
}));
vi.mock("../use-design-profile-distillation", () => ({
  useDesignProfileDistillation: (args: { onResolved?: () => void }) => {
    mocks.notifyResolved = args?.onResolved ?? null;
    return { status: "idle", message: null, upload: vi.fn() };
  },
}));

import { DesignSystemPrompt } from "./design-system-prompt";

const noProfile = { hasActiveProfile: false, tokenCss: "", componentCss: "" };
const withProfile = { hasActiveProfile: true, tokenCss: ":root{}", componentCss: "" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActiveDesignProfile.mockResolvedValue(noProfile);
  mocks.roomStatuses = [];
});
afterEach(cleanup);

describe("DesignSystemPrompt", () => {
  it("offers the upload once the Design Agent is addressed and the room has no design system", async () => {
    render(<DesignSystemPrompt roomId="11111111-1111-4111-8111-111111111111" isActive />);

    expect(
      await screen.findByRole("button", { name: "Upload" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No design system yet")).toBeInTheDocument();
  });

  it("stays out of the way when the Design Agent is not addressed", async () => {
    render(
      <DesignSystemPrompt
        roomId="11111111-1111-4111-8111-111111111111"
        isActive={false}
      />,
    );

    await Promise.resolve();
    expect(screen.queryByTestId("design-system-banner")).not.toBeInTheDocument();
    // Nothing is read until it could matter -- addressing the Design Agent is
    // what makes a missing design system worth mentioning.
    expect(mocks.getActiveDesignProfile).not.toHaveBeenCalled();
  });

  it("says nothing when the room already has a design system", async () => {
    mocks.getActiveDesignProfile.mockResolvedValue(withProfile);
    render(<DesignSystemPrompt roomId="11111111-1111-4111-8111-111111111111" isActive />);

    await waitFor(() =>
      expect(mocks.getActiveDesignProfile).toHaveBeenCalledTimes(1),
    );
    expect(screen.queryByTestId("design-system-banner")).not.toBeInTheDocument();
  });

  it("never flashes the banner before the read resolves", () => {
    render(<DesignSystemPrompt roomId="11111111-1111-4111-8111-111111111111" isActive />);

    // Synchronously after mount the answer isn't known yet; assuming "has one"
    // keeps an unprompted banner from blinking into view and out again.
    expect(screen.queryByTestId("design-system-banner")).not.toBeInTheDocument();
  });

  it("reads once across repeated addressing, not on every keystroke", async () => {
    const view = render(
      <DesignSystemPrompt roomId="11111111-1111-4111-8111-111111111111" isActive />,
    );
    await waitFor(() =>
      expect(mocks.getActiveDesignProfile).toHaveBeenCalledTimes(1),
    );

    view.rerender(
      <DesignSystemPrompt
        roomId="11111111-1111-4111-8111-111111111111"
        isActive={false}
      />,
    );
    view.rerender(
      <DesignSystemPrompt roomId="11111111-1111-4111-8111-111111111111" isActive />,
    );

    expect(mocks.getActiveDesignProfile).toHaveBeenCalledTimes(1);
  });

  describe("a distill already running in this room", () => {
    // A distill takes minutes. Its progress lived only in the component that
    // started it, so a reload -- or a second person in the room -- saw "No
    // design system yet" and an Upload button, with nothing to say one was
    // already under way. The room's task statuses are already polled, so the
    // answer is there without asking the server anything new.
    it("reports it instead of asking again", async () => {
      mocks.roomStatuses = [
        { taskId: "t1", kind: "design_profile_distill", status: "running" },
      ];
      render(<DesignSystemPrompt roomId="11111111-1111-4111-8111-111111111111" isActive />);

      expect(
        await screen.findByText(/distilling your design system/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Upload" }),
      ).not.toBeInTheDocument();
    });

    it("still counts one that is only queued, not yet picked up", async () => {
      mocks.roomStatuses = [
        { taskId: "t1", kind: "design_profile_distill", status: "queued" },
      ];
      render(<DesignSystemPrompt roomId="11111111-1111-4111-8111-111111111111" isActive />);

      expect(
        await screen.findByText(/distilling your design system/i),
      ).toBeInTheDocument();
    });

    it("goes back to asking once that task has finished", async () => {
      mocks.roomStatuses = [
        { taskId: "t1", kind: "design_profile_distill", status: "failed" },
      ];
      render(<DesignSystemPrompt roomId="11111111-1111-4111-8111-111111111111" isActive />);

      expect(
        await screen.findByRole("button", { name: "Upload" }),
      ).toBeInTheDocument();
    });

    it("ignores other kinds of work happening in the room", async () => {
      mocks.roomStatuses = [
        { taskId: "t1", kind: "design_screen_generate", status: "running" },
      ];
      render(<DesignSystemPrompt roomId="11111111-1111-4111-8111-111111111111" isActive />);

      expect(
        await screen.findByRole("button", { name: "Upload" }),
      ).toBeInTheDocument();
    });
  });

  it("stops asking, but stays to report the result", async () => {
    render(<DesignSystemPrompt roomId="11111111-1111-4111-8111-111111111111" isActive />);
    expect(await screen.findByTestId("design-system-banner")).toBeInTheDocument();

    // The banner reports a finished distill through onResolved. The prompt has
    // to act on that, or it would keep asking for a design system the room now
    // has, until someone reloaded the page.
    await act(async () => {
      await mocks.notifyResolved?.();
    });

    // It used to unmount here -- which meant a wait of several minutes ended
    // with the banner silently vanishing, never saying it had worked or where
    // the result went. Staying mounted is all this component owes; what the
    // banner then says is its own (see design-system-banner.test.tsx).
    expect(screen.getByTestId("design-system-banner")).toBeInTheDocument();
  });

  it("does not appear at all for a room that already had one", async () => {
    // The staying-open behaviour above is scoped to a distill that finished
    // here. A room that already has a design system must still show nothing.
    mocks.getActiveDesignProfile.mockResolvedValue(withProfile);
    render(<DesignSystemPrompt roomId="11111111-1111-4111-8111-111111111111" isActive />);
    await act(async () => {});
    expect(screen.queryByTestId("design-system-banner")).not.toBeInTheDocument();
  });
});
