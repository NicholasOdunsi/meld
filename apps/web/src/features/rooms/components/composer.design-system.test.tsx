// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveDesignProfile: vi.fn(async () => ({
    status: "ok",
    hasActiveProfile: false,
    tokenCss: "",
    componentCss: "",
  })),
}));
vi.mock("@/features/design/design-profile-reader", () => ({
  getActiveDesignProfile: mocks.getActiveDesignProfile,
}));
vi.mock("@/features/design/use-design-profile-distillation", () => ({
  useDesignProfileDistillation: () => ({
    status: "idle",
    message: null,
    upload: vi.fn(),
  }),
}));

import {
  mentions,
  renderComposer,
  setupComposerTestEnvironment,
} from "./composer-test-harness";

setupComposerTestEnvironment();

beforeEach(() => {
  mocks.getActiveDesignProfile.mockClear();
});

const withDesignAgent = [
  ...mentions,
  {
    id: "agent:design",
    label: "Design Agent",
    handle: "design-agent",
    kind: "design",
    description: "Generate a screen",
  },
] as const;

async function mentionDesignAgent() {
  const rendered = renderComposer({ mentions: withDesignAgent });
  await rendered.user.click(
    screen.getByRole("button", { name: "Mention someone" }),
  );
  await rendered.user.click(screen.getByText("Design Agent"));
  return rendered;
}

describe("RoomComposer design-system prompt", () => {
  it("offers a design-system upload above the composer once the Design Agent is mentioned", async () => {
    await mentionDesignAgent();

    const banner = await screen.findByTestId("design-system-banner");
    expect(banner).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();

    // Above the composer, not below it or somewhere else on the page: the
    // point is that you see it while deciding what to ask for.
    const composer = screen.getByTestId("room-chat-composer");
    expect(
      banner.compareDocumentPosition(composer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("says nothing when no agent is mentioned", async () => {
    renderComposer({ mentions: withDesignAgent });

    await Promise.resolve();
    expect(screen.queryByTestId("design-system-banner")).not.toBeInTheDocument();
    expect(mocks.getActiveDesignProfile).not.toHaveBeenCalled();
  });

  it("says nothing when a different agent is mentioned", async () => {
    const { user } = renderComposer({ mentions: withDesignAgent });
    await user.click(screen.getByRole("button", { name: "Mention someone" }));
    await user.click(screen.getByText("Research Agent"));

    await waitFor(() =>
      expect(screen.getByTestId("composer-agent-peek")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("design-system-banner")).not.toBeInTheDocument();
  });

  it("says nothing when the room already has a design system", async () => {
    mocks.getActiveDesignProfile.mockResolvedValueOnce({
      status: "ok",
      hasActiveProfile: true,
      tokenCss: ":root{}",
      componentCss: "",
    });
    await mentionDesignAgent();

    await waitFor(() =>
      expect(mocks.getActiveDesignProfile).toHaveBeenCalled(),
    );
    expect(screen.queryByTestId("design-system-banner")).not.toBeInTheDocument();
  });
});
