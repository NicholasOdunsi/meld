// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoppedOverlay } from "./stopped-overlay";

afterEach(cleanup);

describe("StoppedOverlay", () => {
  it("says the screen stopped responding and offers Reload and Show code", async () => {
    const onReload = vi.fn();
    const onShowCode = vi.fn();
    render(<StoppedOverlay reason="stuck" detail={null} onReload={onReload} onShowCode={onShowCode} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This screen stopped responding");
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    await userEvent.click(screen.getByRole("button", { name: "Show code" }));
    expect(onReload).toHaveBeenCalledOnce();
    expect(onShowCode).toHaveBeenCalledOnce();
  });

  it("names a start-up error instead", () => {
    render(<StoppedOverlay reason="crashed" detail="x is not defined" onReload={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This screen hit an error");
    expect(screen.getByText("x is not defined")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show code" })).toBeNull();
  });
  it("renders untrusted error details as plain text", () => {
    const detail = '<img src=x onerror="alert(1)">';
    const { container } = render(<StoppedOverlay reason="crashed" detail={detail} onReload={vi.fn()} />);
    expect(screen.getByText(detail)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("uses stopped copy for a timeout and hides unrelated detail", () => {
    render(<StoppedOverlay reason="timeout" detail="unrelated error" onReload={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This screen stopped responding");
    expect(screen.queryByText("unrelated error")).toBeNull();
  });

});
