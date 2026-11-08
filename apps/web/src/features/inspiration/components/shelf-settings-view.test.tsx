// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfConnectCode: vi.fn(),
  listShelfTokens: vi.fn(async () => []),
  revokeShelfToken: vi.fn(),
}));
vi.mock("../shelf-connection", () => mocks);

import { ShelfSettingsView } from "./shelf-settings-view";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => vi.clearAllMocks());

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const TOKEN = { id: "11111111-1111-4111-8111-111111111111", deviceName: "Studio Mac", createdAt: "2026-11-06T10:00:00.000Z", lastUsedAt: null };

describe("ShelfSettingsView", () => {
  it("shows a one-time code with a countdown", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-06T10:00:00.000Z") });
    mocks.createShelfConnectCode.mockResolvedValue({ status: "created", code: "ABCD1234", expiresAt: "2026-11-06T10:10:00.000Z" });
    render(<ShelfSettingsView workspaceId={WORKSPACE} initialTokens={[]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect shelf" }));
    });
    expect(screen.getByText("ABCD1234")).toBeInTheDocument();
    expect(screen.getByText("Expires in 10:00")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText("Expires in 8:59")).toBeInTheDocument();
  });

  it("shows the server's message when a code can't be made", async () => {
    mocks.createShelfConnectCode.mockResolvedValue({ status: "error", message: "Use the code already on screen before making another one." });
    render(<ShelfSettingsView workspaceId={WORKSPACE} initialTokens={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect shelf" }));
    expect(await screen.findByText("Use the code already on screen before making another one.")).toBeInTheDocument();
  });

  it("lists the connected shelf and disconnects it after confirming", async () => {
    mocks.revokeShelfToken.mockResolvedValue({ status: "revoked" });
    render(<ShelfSettingsView workspaceId={WORKSPACE} initialTokens={[TOKEN]} />);
    expect(screen.getByText("Studio Mac")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect shelf" }));
    await waitFor(() => expect(mocks.revokeShelfToken).toHaveBeenCalledWith(TOKEN.id));
    expect(mocks.listShelfTokens).toHaveBeenCalledWith(WORKSPACE);
  });
});
