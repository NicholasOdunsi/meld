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
import { PAIRING_COMMAND } from "./use-pairing-code";

const CODEX_CODE = "CDX2PAIR";
const CLAUDE_CODE = "CLD2PAIR";
const NOW = new Date("2026-07-29T12:00:00.000Z");

function pairingResponse(code: string, lifetimeMs = 60_000) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      code,
      expiresAt: new Date(NOW.getTime() + lifetimeMs).toISOString(),
    }),
  } as unknown as Response;
}

function malformedPairingResponse() {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      code: CLAUDE_CODE,
      expiresAt: "not-a-date",
    }),
  } as unknown as Response;
}

function errorResponse(
  status: number,
  error = "We could not create the pairing code.",
) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ error }),
  } as unknown as Response;
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
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

  it("builds the pairing command from the shared usePairingCode constant", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(pairingResponse(CODEX_CODE));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectDevice />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });

    expect(screen.getByTestId("pairing-command")).toHaveTextContent(
      `${PAIRING_COMMAND} ${CODEX_CODE}`,
    );
  });

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

  it("retries an expired code with the provider that minted the visible snapshot", async () => {
    const replacementCode = "NEWCDX22";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingResponse(CODEX_CODE))
      .mockResolvedValueOnce(errorResponse(409))
      .mockResolvedValueOnce(pairingResponse(replacementCode, 120_000));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectDevice />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });
    expect(screen.getByTestId("pairing-code")).toHaveTextContent(CODEX_CODE);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Claude" }),
      );
    });
    expect(screen.getByText("Codex pairing code")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.queryByTestId("pairing-code")).not.toBeInTheDocument();
    const expired = screen.getByTestId("expired-pairing-code");
    await act(async () => {
      fireEvent.click(
        within(expired).getByRole("button", {
          name: "Generate a new code",
        }),
      );
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/devices/pairing-codes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ requestedProvider: "codex" }),
      }),
    );
    expect(screen.getByTestId("pairing-code")).toHaveTextContent(
      replacementCode,
    );
    expect(screen.getByTestId("pairing-command")).toHaveTextContent(
      `pnpm --filter @meld/connector cli -- pair --join ${replacementCode}`,
    );
    expect(screen.getByText("Codex pairing code")).toBeInTheDocument();
    expect(screen.getByText("Expires in 60 seconds.")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "We could not create a pairing code. Please try again.",
      ),
    ).not.toBeInTheDocument();
  });

  it("preserves a usable snapshot when a successful response is malformed", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingResponse(CODEX_CODE))
      .mockResolvedValueOnce(malformedPairingResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectDevice />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Claude" }),
      );
    });

    expect(screen.getByTestId("pairing-code")).toHaveTextContent(CODEX_CODE);
    expect(screen.getByTestId("pairing-command")).toHaveTextContent(
      `pnpm --filter @meld/connector cli -- pair --join ${CODEX_CODE}`,
    );
    expect(screen.getByText("Codex pairing code")).toBeInTheDocument();
    expect(screen.getByText("Expires in 60 seconds.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "We could not create a pairing code. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Generate a new code",
      }),
    ).not.toBeInTheDocument();
  });

  it("preserves a usable code and its provider when quota blocks a replacement", async () => {
    const quotaGuidance =
      "Use the pairing code already on screen before generating another one.";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingResponse(CODEX_CODE))
      .mockResolvedValueOnce(errorResponse(400, quotaGuidance));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectDevice />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });
    expect(screen.getByText("Codex pairing code")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Claude" }),
      );
    });

    expect(screen.getByTestId("pairing-code")).toHaveTextContent(CODEX_CODE);
    expect(screen.getByTestId("pairing-command")).toHaveTextContent(
      `pnpm --filter @meld/connector cli -- pair --join ${CODEX_CODE}`,
    );
    expect(screen.getByText("Codex pairing code")).toBeInTheDocument();
    expect(screen.queryByText("Claude pairing code")).not.toBeInTheDocument();
    expect(screen.getByText(quotaGuidance)).toBeInTheDocument();
    expect(screen.getByText("Expires in 60 seconds.")).toBeInTheDocument();
  });

  it("preserves a usable code and shows generic retry copy after an unrelated failure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingResponse(CODEX_CODE))
      .mockResolvedValueOnce(errorResponse(409));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectDevice />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Claude" }),
      );
    });

    expect(screen.getByTestId("pairing-code")).toHaveTextContent(CODEX_CODE);
    expect(screen.getByText("Codex pairing code")).toBeInTheDocument();
    expect(
      screen.getByText(
        "We could not create a pairing code. Please try again.",
      ),
    ).toBeInTheDocument();
  });

  it("replaces code, command, and provider together after a successful request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingResponse(CODEX_CODE))
      .mockResolvedValueOnce(pairingResponse(CLAUDE_CODE));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectDevice />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Claude" }),
      );
    });

    expect(screen.getByTestId("pairing-code")).toHaveTextContent(CLAUDE_CODE);
    expect(screen.getByTestId("pairing-command")).toHaveTextContent(
      `pnpm --filter @meld/connector cli -- pair --join ${CLAUDE_CODE}`,
    );
    expect(screen.getByText("Claude pairing code")).toBeInTheDocument();
    expect(screen.queryByText("Codex pairing code")).not.toBeInTheDocument();
  });

  it("preserves the visible code on a provider switch and ignores a stale success", async () => {
    const quotaGuidance =
      "Use the pairing code already on screen before generating another one.";
    const staleClaude = deferredResponse();
    const latestCodex = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingResponse("OLDCODE1"))
      .mockReturnValueOnce(staleClaude.promise)
      .mockReturnValueOnce(latestCodex.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectDevice />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });
    expect(screen.getByTestId("pairing-code")).toHaveTextContent(
      "OLDCODE1",
    );

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Claude" }),
      );
    });
    expect(screen.getByTestId("pairing-code")).toHaveTextContent(
      "OLDCODE1",
    );
    expect(screen.getByTestId("pairing-command")).toHaveTextContent(
      "pnpm --filter @meld/connector cli -- pair --join OLDCODE1",
    );
    expect(screen.getByText("Codex pairing code")).toBeInTheDocument();
    expect(screen.getByText("Expires in 60 seconds.")).toBeInTheDocument();

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });
    await act(async () => {
      latestCodex.resolve(errorResponse(400, quotaGuidance));
      await latestCodex.promise;
    });
    expect(screen.getByTestId("pairing-code")).toHaveTextContent(
      "OLDCODE1",
    );
    expect(screen.getByText("Codex pairing code")).toBeInTheDocument();
    expect(screen.getByText(quotaGuidance)).toBeInTheDocument();

    await act(async () => {
      staleClaude.resolve(pairingResponse(CLAUDE_CODE));
      await staleClaude.promise;
    });
    expect(screen.getByTestId("pairing-code")).toHaveTextContent(
      "OLDCODE1",
    );
    expect(screen.queryByText("Claude pairing code")).not.toBeInTheDocument();
    expect(screen.getByText(quotaGuidance)).toBeInTheDocument();
  });

  it("ignores a stale failure after the latest request succeeds", async () => {
    const staleClaude = deferredResponse();
    const latestCodex = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingResponse("OLDCODE1"))
      .mockReturnValueOnce(staleClaude.promise)
      .mockReturnValueOnce(latestCodex.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectDevice />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });
    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Claude" }),
      );
    });
    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });

    await act(async () => {
      latestCodex.resolve(pairingResponse(CODEX_CODE));
      await latestCodex.promise;
    });
    await act(async () => {
      staleClaude.resolve(errorResponse(409));
      await staleClaude.promise;
    });

    expect(screen.getByTestId("pairing-code")).toHaveTextContent(CODEX_CODE);
    expect(screen.getByText("Codex pairing code")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "We could not create a pairing code. Please try again.",
      ),
    ).not.toBeInTheDocument();
  });
});
