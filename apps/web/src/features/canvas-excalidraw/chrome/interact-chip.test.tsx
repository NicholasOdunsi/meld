// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { InteractChip } from "./interact-chip";

afterEach(cleanup);

it("shows a pressed Interact toggle with 'Interacting' under the screen, and turning it off calls back", async () => {
  const onToggle = vi.fn();
  render(<InteractChip bounds={{ x: 100, y: 50, width: 200, height: 300 }} view={{ scrollX: 0, scrollY: 0, zoom: 1 }} onToggle={onToggle} />);
  const toggle = screen.getByRole("button", { name: "Interact" });
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Interacting")).toBeInTheDocument();
  expect(screen.getByTestId("interact-chip").style.transform).toContain("200px");
  expect(screen.getByTestId("interact-chip").style.transform).toContain("350px");
  await userEvent.click(toggle);
  expect(onToggle).toHaveBeenCalledOnce();
});
