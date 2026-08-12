// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmptyRoomStart } from "./empty-room-start";

afterEach(cleanup);

describe("EmptyRoomStart", () => {
  it("offers all three starters", () => {
    render(<EmptyRoomStart onPrefill={vi.fn()} onChooseUserFlow={vi.fn()} />);
    expect(screen.getByText(/^Plan a Feature/)).toBeInTheDocument();
    expect(screen.getByText(/^Map a User Flow/)).toBeInTheDocument();
    expect(screen.getByText(/^Brainstorm/)).toBeInTheDocument();
  });

  it("pre-fills a Product Agent feature-planning prompt", async () => {
    const user = userEvent.setup();
    const onPrefill = vi.fn();
    render(<EmptyRoomStart onPrefill={onPrefill} onChooseUserFlow={vi.fn()} />);

    await user.click(screen.getByText(/^Plan a Feature/));

    expect(onPrefill).toHaveBeenCalledWith(
      "@Product Agent I want to plan a feature for ",
    );
  });

  it("opens the user-flow choice instead of pre-filling when mapping a flow", async () => {
    const user = userEvent.setup();
    const onPrefill = vi.fn();
    const onChooseUserFlow = vi.fn();
    render(
      <EmptyRoomStart onPrefill={onPrefill} onChooseUserFlow={onChooseUserFlow} />,
    );

    await user.click(screen.getByText(/^Map a User Flow/));

    expect(onChooseUserFlow).toHaveBeenCalledOnce();
    expect(onPrefill).not.toHaveBeenCalled();
  });

  it("pre-fills a Research Agent brainstorming prompt", async () => {
    const user = userEvent.setup();
    const onPrefill = vi.fn();
    render(<EmptyRoomStart onPrefill={onPrefill} onChooseUserFlow={vi.fn()} />);

    await user.click(screen.getByText(/^Brainstorm/));

    expect(onPrefill).toHaveBeenCalledWith(
      "@Research Agent I want to brainstorm ideas for ",
    );
  });
});
