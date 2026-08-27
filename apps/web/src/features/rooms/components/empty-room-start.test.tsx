// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmptyRoomStart } from "./empty-room-start";

afterEach(cleanup);

describe("EmptyRoomStart", () => {
  it("offers all three starters", () => {
    render(<EmptyRoomStart onPrefill={vi.fn()} />);
    expect(screen.getByText(/^Plan a Feature/)).toBeInTheDocument();
    expect(screen.getByText(/^Design a Screen/)).toBeInTheDocument();
    expect(screen.getByText(/^Brainstorm/)).toBeInTheDocument();
  });

  // "Map a User Flow" was removed along with the choice card it opened, and
  // "Design a Screen" took its slot. Pinned so it cannot drift back in.
  it("no longer offers mapping a user flow", () => {
    render(<EmptyRoomStart onPrefill={vi.fn()} />);
    expect(screen.queryByText(/Map a User Flow/)).not.toBeInTheDocument();
  });

  it("pre-fills a Product Agent feature-planning prompt", async () => {
    const user = userEvent.setup();
    const onPrefill = vi.fn();
    render(<EmptyRoomStart onPrefill={onPrefill} />);

    await user.click(screen.getByText(/^Plan a Feature/));

    expect(onPrefill).toHaveBeenCalledWith(
      "@Product Agent I want to plan a feature for ",
    );
  });

  it("pre-fills a Design Agent screen prompt", async () => {
    const user = userEvent.setup();
    const onPrefill = vi.fn();
    render(<EmptyRoomStart onPrefill={onPrefill} />);

    await user.click(screen.getByText(/^Design a Screen/));

    // Must be the exact mention text the composer parses, or the send routes
    // as prose instead of reaching the Design Agent.
    expect(onPrefill).toHaveBeenCalledWith("@Design Agent design a screen for ");
  });

  it("pre-fills a Research Agent brainstorming prompt", async () => {
    const user = userEvent.setup();
    const onPrefill = vi.fn();
    render(<EmptyRoomStart onPrefill={onPrefill} />);

    await user.click(screen.getByText(/^Brainstorm/));

    expect(onPrefill).toHaveBeenCalledWith(
      "@Research Agent I want to brainstorm ideas for ",
    );
  });
});
