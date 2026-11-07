// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

afterEach(cleanup);

describe("ConfirmDeleteDialog", () => {
  it("explains that rooms lose the images too, and confirms", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDeleteDialog isOpen count={2} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByText("Delete 2 images?")).toBeInTheDocument();
    expect(screen.getByText("They'll also be removed from any rooms using them.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
