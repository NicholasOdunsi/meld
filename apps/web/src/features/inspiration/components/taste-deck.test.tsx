// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ decideTasteSuggestion: vi.fn(async () => ({ status: "kept" })) }));
vi.mock("../taste/taste-actions", () => actions);

import { TasteDeckButton } from "./taste-deck";

afterEach(cleanup);
const pending = [
  { id: "a", tile: "density" as const, headline: "Density: airy → balanced", reason: "Your newest dashboards are denser", evidence: [] },
  { id: "b", tile: "signatureDetails" as const, headline: "Add “Pill buttons” to Signature details", reason: "Seen in 3 of your 5 newest saves", evidence: [{ id: "i", imageUrl: "data:image/png;base64,AA==" }] },
];

describe("TasteDeckButton", () => {
  it("shows the count and walks the deck one card at a time", async () => {
    const onDone = vi.fn();
    render(<TasteDeckButton pending={pending} onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "2 updates · Review" }));
    expect(screen.getByText("1 of 2")).toBeVisible();
    expect(screen.getByText("Density: airy → balanced")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(actions.decideTasteSuggestion).toHaveBeenCalledWith({ suggestionId: "a", decision: "kept" });
    expect(screen.getByText("2 of 2")).toBeVisible();
    expect(screen.getAllByRole("img", { name: "Evidence image" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Not me" }));
    expect(actions.decideTasteSuggestion).toHaveBeenLastCalledWith({ suggestionId: "b", decision: "rejected" });
    expect(onDone).toHaveBeenCalled();
  });

  it("renders nothing with no pending suggestions", () => {
    const { container } = render(<TasteDeckButton pending={[]} onDone={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
