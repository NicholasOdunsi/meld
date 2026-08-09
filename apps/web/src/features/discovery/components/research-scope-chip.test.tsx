// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchScopeChip } from "./research-scope-chip";

afterEach(cleanup);

describe("ResearchScopeChip", () => {
  it("names the sources the Research Agent may read", () => {
    render(<ResearchScopeChip scope="room" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Room only/ }),
    ).toBeInTheDocument();
  });

  it("says plainly when the web is in scope", () => {
    render(<ResearchScopeChip scope="web" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Web \+ room/ }),
    ).toBeInTheDocument();
  });

  it("reports a change of sources", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ResearchScopeChip scope="room" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Room only/ }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Web + room" }),
    );

    expect(onChange).toHaveBeenCalledWith("web");
  });
});
