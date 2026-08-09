// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { Text } from "@astryxdesign/core/Text";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { readRoomRouting, writeRoomRouting } from "./room-routing-store";
import { useRoomRouting } from "./use-room-routing";

const ROOM_ID = "20000000-0000-4000-8000-000000000002";
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

function Probe({
  initialProviderOverride,
}: {
  initialProviderOverride?: "codex" | "claude";
}) {
  const { routing, choose } = useRoomRouting({
    roomId: ROOM_ID,
    readiness: READY,
    initialProviderOverride,
  });
  return (
    <>
      <Text data-testid="resolved">{routing?.provider ?? "none"}</Text>
      <button type="button" onClick={() => choose("claude")}>
        Choose Claude
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("useRoomRouting", () => {
  it("starts on the saved default when the room has no override", () => {
    render(<Probe />);
    expect(screen.getByTestId("resolved")).toHaveTextContent("codex");
  });

  it("persists a choice so the room reopens on it", async () => {
    const user = userEvent.setup();
    render(<Probe />);

    await user.click(screen.getByRole("button", { name: "Choose Claude" }));

    expect(screen.getByTestId("resolved")).toHaveTextContent("claude");
    expect(readRoomRouting(ROOM_ID)).toEqual({ provider: "claude" });
  });

  it("hydrates a previously stored override", async () => {
    writeRoomRouting(ROOM_ID, { provider: "claude" });
    render(<Probe />);

    expect(await screen.findByText("claude")).toBeInTheDocument();
  });

  it("lets a restored draft's provider win over storage", async () => {
    writeRoomRouting(ROOM_ID, { provider: "claude" });
    render(<Probe initialProviderOverride="codex" />);

    expect(await screen.findByText("codex")).toBeInTheDocument();
  });
});
