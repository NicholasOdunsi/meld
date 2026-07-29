// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectDevice } from "./connect-device";

const CODEX_CODE = "CDX2PAIR";
const CLAUDE_CODE = "CLD2PAIR";
const NOW = new Date("2026-07-29T12:00:00.000Z");

function pairingResponse(code: string) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      code,
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    }),
  } as unknown as Response;
}

describe("ConnectDevice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each([
    ["Codex", "codex", CODEX_CODE],
    ["Claude", "claude", CLAUDE_CODE],
  ] as const)(
    "makes %s selectable and renders its pairing command",
    async (label, provider, code) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(pairingResponse(code));
      vi.stubGlobal("fetch", fetchMock);
      render(<ConnectDevice />);

      const codex = screen.getByRole("button", {
        name: "Connect Codex",
      });
      const claude = screen.getByRole("button", {
        name: "Connect Claude",
      });
      expect(codex).toBeEnabled();
      expect(claude).toBeEnabled();
      expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", {
            name: `Connect ${label}`,
          }),
        );
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/devices/pairing-codes",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ requestedProvider: provider }),
        }),
      );
      expect(screen.getByTestId("pairing-code")).toHaveTextContent(code);
      expect(screen.getByTestId("pairing-command")).toHaveTextContent(
        `pnpm --filter @meld/connector cli -- pair --join ${code}`,
      );
    },
  );

  it("discloses the connector install and removal behavior", () => {
    render(<ConnectDevice />);

    const disclosure = screen.getByTestId("connector-disclosure");
    expect(disclosure).toHaveTextContent(
      "~/Library/Application Support/Meld/",
    );
    expect(disclosure).toHaveTextContent(/runs in the background/i);
    expect(disclosure).toHaveTextContent(/restarts at login/i);
    expect(disclosure).toHaveTextContent(/Keychain/i);
    expect(disclosure).toHaveTextContent(
      /pnpm --filter @meld\/connector cli -- uninstall/i,
    );
    expect(disclosure).toHaveTextContent(/provider login happens separately/i);
    expect(disclosure).toHaveTextContent(/no Xcode/i);
    expect(disclosure).toHaveTextContent(/no Homebrew/i);
    expect(disclosure).toHaveTextContent(/no sudo/i);
    expect(disclosure).toHaveTextContent(/no open Terminal after setup/i);
  });

  it("replaces an expired code with a generate action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(pairingResponse(CODEX_CODE)),
    );
    render(<ConnectDevice />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });
    expect(screen.getByTestId("pairing-code")).toHaveTextContent(CODEX_CODE);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.queryByTestId("pairing-code")).not.toBeInTheDocument();
    const expired = screen.getByTestId("expired-pairing-code");
    expect(
      within(expired).getByRole("button", {
        name: "Generate a new code",
      }),
    ).toBeEnabled();
  });
});
