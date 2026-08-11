// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { AgentRoutingChip } from "./agent-routing-chip";

afterEach(cleanup);

const DEVICE_ID = "d0000000-0000-4000-8000-000000000000";

const READY: AgentReadiness = {
  ready: true,
  defaultProvider: "codex",
  defaultDeviceId: DEVICE_ID,
  providers: [
    { provider: "codex", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
    { provider: "claude", deviceId: DEVICE_ID, deviceName: "Ada's MacBook" },
  ],
};

const CODEX_ONLY: AgentReadiness = {
  ...READY,
  providers: [READY.providers[0]],
};

function renderChip(props: Partial<Parameters<typeof AgentRoutingChip>[0]> = {}) {
  const onChoose = vi.fn();
  const onConnect = vi.fn();
  render(
    <AgentRoutingChip
      readiness={READY}
      routing={{ provider: "codex" }}
      isAgentAddressed={false}
      onChoose={onChoose}
      onConnect={onConnect}
      {...props}
    />,
  );
  return { onChoose, onConnect, user: userEvent.setup() };
}

describe("AgentRoutingChip", () => {
  it("is present with no agent mention in the draft", () => {
    renderChip({ isAgentAddressed: false });
    // The whole point of the redesign: the row never gains or loses a control.
    expect(screen.getByTestId("agent-provider-picker")).toBeInTheDocument();
  });

  it("is present when an agent is addressed", () => {
    renderChip({ isAgentAddressed: true });
    expect(screen.getByTestId("agent-provider-picker")).toBeInTheDocument();
  });

  it("names the selected model and shows its provider mark", () => {
    renderChip({ routing: { provider: "claude" } });
    const button = screen.getByRole("button", { name: /Opus 4.8/ });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Opus 4.8");
    expect(button).not.toHaveTextContent("Answer with");
  });

  it("reports the provider selected through a model", async () => {
    const { onChoose, user } = renderChip();

    await user.click(screen.getByRole("button", { name: /GPT-5.5/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Opus 4.8" }));

    expect(onChoose).toHaveBeenCalledWith("claude", "claude-opus-4-8");
  });

  it("reports a model directly and displays it when selected", async () => {
    const { onChoose, user } = renderChip({
      readiness: {
        ...READY,
        providers: [
          {
            provider: "claude",
            deviceId: DEVICE_ID,
            deviceName: "Ada's MacBook",
            models: ["claude-opus-4-8", "claude-sonnet-4-5"],
            defaultModel: "claude-opus-4-8",
          },
        ],
        defaultProvider: "claude",
      },
      routing: { provider: "claude", model: "claude-opus-4-8" },
    });

    await user.click(screen.getByRole("button", { name: /Opus 4.8/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Sonnet 4.5" }));

    expect(onChoose).toHaveBeenCalledWith("claude", "claude-sonnet-4-5");

    renderChip({
      readiness: {
        ...READY,
        providers: [
          {
            provider: "claude",
            deviceId: DEVICE_ID,
            deviceName: "Ada's MacBook",
            models: ["claude-opus-4-8", "claude-sonnet-4-5"],
            defaultModel: "claude-opus-4-8",
          },
        ],
        defaultProvider: "claude",
      },
      routing: { provider: "claude", model: "claude-sonnet-4-5" },
    });
    expect(screen.getAllByRole("button", { name: /Sonnet 4.5/ })[0]).toHaveTextContent(
      "Sonnet 4.5",
    );
  });

  it("still shows a chip with a single ready provider, and offers a way forward", async () => {
    const { user } = renderChip({ readiness: CODEX_ONLY });

    // The old Selector hid itself here, leaving the author with no statement of
    // who answers and no route to adding another provider.
    const chip = screen.getByTestId("agent-provider-picker");
    expect(chip).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /GPT-5.5/ }));
    expect(
      screen.getByRole("menuitem", { name: /Connect another provider/ }),
    ).toBeInTheDocument();
  });

  it("becomes a connect prompt when nothing is connected", async () => {
    const { onConnect, user } = renderChip({
      readiness: { ready: false, reason: "no_device" },
      routing: undefined,
      isAgentAddressed: true,
    });

    await user.click(screen.getByRole("button", { name: /Connect AI/ }));
    await user.click(screen.getByRole("menuitem", { name: /Connect your AI/ }));

    expect(onConnect).toHaveBeenCalled();
  });

  it("claims no provider while readiness is loading", () => {
    renderChip({ readiness: undefined, routing: undefined });

    const chip = screen.getByRole("button", { name: /AI/ });
    expect(chip).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Codex/ })).not.toBeInTheDocument();
  });
});
