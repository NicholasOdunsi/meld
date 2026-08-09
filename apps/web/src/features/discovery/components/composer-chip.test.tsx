// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { ComposerChip } from "./composer-chip";

afterEach(cleanup);

function renderChip(props: Partial<Parameters<typeof ComposerChip>[0]> = {}) {
  return render(
    <ComposerChip
      label="Claude"
      tone="rest"
      menuLabel="Answer with"
      testId="chip"
      {...props}
    >
      <DropdownMenuRadioGroup
        aria-label="Answer with"
        value="claude"
        onChange={() => {}}
      >
        <DropdownMenuRadioItem value="claude" label="Claude" />
        <DropdownMenuRadioItem value="codex" label="Codex" />
      </DropdownMenuRadioGroup>
    </ComposerChip>,
  );
}

describe("ComposerChip", () => {
  it("renders its current value as the accessible name of a button", () => {
    renderChip();
    expect(
      screen.getByRole("button", { name: /Claude/ }),
    ).toBeInTheDocument();
  });

  it("opens its menu on click", async () => {
    const user = userEvent.setup();
    renderChip();

    await user.click(screen.getByRole("button", { name: /Claude/ }));

    expect(
      screen.getByRole("menuitemradio", { name: "Codex" }),
    ).toBeInTheDocument();
  });

  it("stays interactive at rest -- dim is a tone, not a disabled state", () => {
    renderChip({ tone: "rest" });
    expect(screen.getByRole("button", { name: /Claude/ })).toBeEnabled();
  });

  it("renders an inert, unopenable chip while readiness is loading", async () => {
    const user = userEvent.setup();
    renderChip({ isInert: true, label: "AI" });

    const chip = screen.getByRole("button", { name: /AI/ });
    expect(chip).toBeDisabled();
    await user.click(chip);
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  });
});
