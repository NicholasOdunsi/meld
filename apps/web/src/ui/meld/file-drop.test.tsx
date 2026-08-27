// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MeldFileDrop } from "./file-drop";

beforeEach(() => {
  // jsdom implements neither; the preview effect calls both.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

const png = () => new File(["x"], "logo.png", { type: "image/png" });

it("names the input from its own label, not the zone copy", () => {
  render(
    <MeldFileDrop label="Workspace logo" value={null} onValueChange={vi.fn()} />,
  );

  // Both the field label and the drop zone are labels; without aria-labelledby
  // the accessible name would concatenate all of it.
  const input = screen.getByLabelText("Workspace logo");
  expect(input).toHaveAttribute("type", "file");
});

it("reports the chosen file", async () => {
  const onValueChange = vi.fn();
  render(
    <MeldFileDrop
      label="Workspace logo"
      value={null}
      onValueChange={onValueChange}
    />,
  );

  await userEvent.upload(screen.getByLabelText("Workspace logo"), png());

  expect(onValueChange).toHaveBeenCalledOnce();
  expect(onValueChange.mock.calls[0]?.[0]).toBeInstanceOf(File);
});

it("accepts a dropped file", () => {
  const onValueChange = vi.fn();
  const { container } = render(
    <MeldFileDrop
      label="Workspace logo"
      value={null}
      onValueChange={onValueChange}
    />,
  );

  const zone = container.querySelector("label")!;
  fireEvent.drop(zone, { dataTransfer: { files: [png()] } });

  expect(onValueChange).toHaveBeenCalledOnce();
});

it("shows the file name once one is chosen", () => {
  render(
    <MeldFileDrop
      label="Workspace logo"
      value={png()}
      onValueChange={vi.fn()}
    />,
  );

  expect(screen.getByText("logo.png")).toBeInTheDocument();
});

it("prompts with the hint while empty", () => {
  render(
    <MeldFileDrop
      label="Workspace logo"
      value={null}
      onValueChange={vi.fn()}
      hint="PNG up to 2 MB"
    />,
  );

  expect(screen.getByText("PNG up to 2 MB")).toBeInTheDocument();
  expect(screen.getByText(/drop your workspace logo here/i)).toBeInTheDocument();
});

it("marks itself invalid and describes the error", () => {
  render(
    <MeldFileDrop
      label="Workspace logo"
      value={null}
      onValueChange={vi.fn()}
      errorMessage="That file is too large."
    />,
  );

  const input = screen.getByLabelText("Workspace logo");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("That file is too large.");
});

it("revokes the preview URL when the file changes", () => {
  const { rerender, unmount } = render(
    <MeldFileDrop
      label="Workspace logo"
      value={png()}
      onValueChange={vi.fn()}
    />,
  );
  expect(URL.createObjectURL).toHaveBeenCalledOnce();

  rerender(
    <MeldFileDrop
      label="Workspace logo"
      value={null}
      onValueChange={vi.fn()}
    />,
  );
  // Object URLs leak until revoked.
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");

  unmount();
});

it("forwards the accept list and form name", () => {
  render(
    <MeldFileDrop
      label="Workspace logo"
      name="logo"
      accept="image/png"
      value={null}
      onValueChange={vi.fn()}
    />,
  );

  const input = screen.getByLabelText("Workspace logo");
  expect(input).toHaveAttribute("name", "logo");
  expect(input).toHaveAttribute("accept", "image/png");
});
