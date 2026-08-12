// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ComposerUserFlowChoice,
  USER_FLOW_CHOICE_QUESTION,
} from "./composer-user-flow-choice";

afterEach(cleanup);

function renderCard(
  overrides: Partial<
    Parameters<typeof ComposerUserFlowChoice>[0]
  > = {},
) {
  const props = {
    onSelectManual: vi.fn(),
    onSelectAgent: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<ComposerUserFlowChoice {...props} />);
  return props;
}

describe("ComposerUserFlowChoice", () => {
  it("shows the question and both options", () => {
    renderCard();
    expect(screen.getByText(USER_FLOW_CHOICE_QUESTION)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Map it myself" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Let the agent do it" }),
    ).toBeInTheDocument();
  });

  it("selects the manual option on click", async () => {
    const user = userEvent.setup();
    const { onSelectManual } = renderCard();

    await user.click(screen.getByRole("button", { name: "Map it myself" }));

    expect(onSelectManual).toHaveBeenCalledOnce();
  });

  it("selects the agent option on click", async () => {
    const user = userEvent.setup();
    const { onSelectAgent } = renderCard();

    await user.click(
      screen.getByRole("button", { name: "Let the agent do it" }),
    );

    expect(onSelectAgent).toHaveBeenCalledOnce();
  });

  it("dismisses from the close button", async () => {
    const user = userEvent.setup();
    const { onDismiss } = renderCard();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("maps the number and escape keys to the options", async () => {
    const user = userEvent.setup();
    const { onSelectManual, onSelectAgent, onDismiss } = renderCard();

    await user.keyboard("1");
    expect(onSelectManual).toHaveBeenCalledOnce();

    await user.keyboard("2");
    expect(onSelectAgent).toHaveBeenCalledOnce();

    await user.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("disables the manual option while it is starting, then re-enables it", async () => {
    const user = userEvent.setup();
    let resolveStart: (() => void) | undefined;
    const onSelectManual = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );
    renderCard({ onSelectManual });

    const manualButton = screen.getByRole("button", { name: "Map it myself" });
    await user.click(manualButton);

    expect(manualButton).toBeDisabled();
    resolveStart?.();
    await waitFor(() => expect(manualButton).not.toBeDisabled());
  });

  it("ignores a second manual start while the first is pending", async () => {
    const user = userEvent.setup();
    let resolveStart: (() => void) | undefined;
    const onSelectManual = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );
    renderCard({ onSelectManual });

    // The number-key shortcut and a click both route through the same guard.
    await user.keyboard("1");
    await user.keyboard("1");

    expect(onSelectManual).toHaveBeenCalledOnce();
    resolveStart?.();
  });
});
