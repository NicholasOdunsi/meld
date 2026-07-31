// @vitest-environment jsdom
//
// Astryx discovery (Step 1, recorded per AGENTS.md; reference output not committed):
//   pnpm exec astryx build "post-invite AI connection setup ..." -> no exact page
//     template; compose the pieces on a page shell.
//   Shell: AppShell (full-page frame) + Center + VStack/HStack foundation layout,
//     matching the sibling onboarding screens (onboarding/page.tsx,
//     invite-onboarding.tsx) so the post-invite step reads as one flow.
//   Components: Heading + Text (copy), Button (provider actions / continue / retry
//     / set up later), CodeBlock (terminal pairing command), StatusDot (durable
//     setup stage — status, not a count), Banner (recovery / failure messaging).
//   Tokens only: spacing/color/radius via var(--*); no raw layout elements, no
//     hardcoded pixel/hex values, no imported stylesheet.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderSetupView } from "../provider-setup-service";
import { AIConnectionSetup } from "./ai-connection-setup";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";
const DEVICE_ID = "20000000-0000-4000-8000-000000000002";
const REQUEST_ID = "70000000-0000-4000-8000-000000000007";
const NOW = new Date("2026-07-29T12:00:00.000Z");

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function setupView(overrides: Partial<ProviderSetupView> = {}): ProviderSetupView {
  return {
    id: REQUEST_ID,
    deviceId: DEVICE_ID,
    provider: "codex",
    status: "queued",
    stage: null,
    progressMessage: null,
    errorCode: null,
    errorMessage: null,
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

// Branch a fetch double on POST-create vs GET-poll, returning the GET
// statuses one at a time and repeating the last one after the sequence ends.
function branchedFetch(getSequence: ProviderSetupView[]) {
  let index = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/devices/provider-setups" && init?.method === "POST") {
      return jsonResponse(setupView({ status: "queued", stage: null }));
    }
    if (url.startsWith("/api/devices/provider-setups/")) {
      const next = getSequence[Math.min(index, getSequence.length - 1)];
      index += 1;
      return jsonResponse(next);
    }
    throw new Error(`unexpected fetch ${url} ${init?.method ?? "GET"}`);
  });
}

describe("AIConnectionSetup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.push.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("offers both providers and a set-up-later escape", () => {
    render(
      <AIConnectionSetup organizationId={ORGANIZATION_ID} devices={[]} />,
    );

    expect(
      screen.getByRole("button", { name: "Connect Codex" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Connect Claude" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Set up later" }),
    ).toBeEnabled();
  });

  it("routes set-up-later to the setup interstitial", () => {
    render(
      <AIConnectionSetup organizationId={ORGANIZATION_ID} devices={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Set up later" }));

    expect(mocks.push).toHaveBeenCalledWith(
      `/onboarding/${ORGANIZATION_ID}/setup`,
    );
  });

  it("gives a brand-new user the local pairing command", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({
          code: "MELD2026",
          expiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AIConnectionSetup organizationId={ORGANIZATION_ID} devices={[]} />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/devices/pairing-codes",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByTestId("pairing-command")).toHaveTextContent(
      "pnpm --filter @meld/connector cli -- pair --join MELD2026",
    );
  });

  it("creates a second-provider setup on an already-paired Mac without pairing again", async () => {
    const fetchMock = branchedFetch([
      setupView({ status: "installing", stage: "installing" }),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AIConnectionSetup
        organizationId={ORGANIZATION_ID}
        devices={[{ id: DEVICE_ID, name: "Studio Mac" }]}
      />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Claude" }),
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/devices/provider-setups",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ deviceId: DEVICE_ID, provider: "claude" }),
      }),
    );
    // No re-pairing: the paired connector is reused.
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/devices/pairing-codes",
      expect.anything(),
    );
    expect(screen.queryByTestId("pairing-command")).not.toBeInTheDocument();
  });

  it("advances through waiting, installing, authenticating, verifying, and ready", async () => {
    const fetchMock = branchedFetch([
      setupView({ status: "installing", stage: "installing" }),
      setupView({ status: "authenticating", stage: "authenticating" }),
      setupView({ status: "verifying", stage: "verifying" }),
      setupView({ status: "completed", stage: null }),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AIConnectionSetup
        organizationId={ORGANIZATION_ID}
        devices={[{ id: DEVICE_ID, name: "Studio Mac" }]}
      />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });
    expect(screen.getByText(/waiting/i)).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText(/installing/i)).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText(/authenticating/i)).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText(/verifying/i)).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText("Ready")).toBeVisible();

    const pollCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith("/api/devices/provider-setups/"),
    ).length;

    // Terminal: polling stops.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    const pollCallsAfter = fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith("/api/devices/provider-setups/"),
    ).length;
    expect(pollCallsAfter).toBe(pollCalls);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(mocks.push).toHaveBeenCalledWith(
      `/onboarding/${ORGANIZATION_ID}/setup`,
    );
  });

  it("shows a stable retry when setup fails", async () => {
    const fetchMock = branchedFetch([
      setupView({
        status: "failed",
        stage: null,
        errorCode: "authentication_failed",
        errorMessage: "Sign-in did not complete",
      }),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AIConnectionSetup
        organizationId={ORGANIZATION_ID}
        devices={[{ id: DEVICE_ID, name: "Studio Mac" }]}
      />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Codex" }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText(/sign-in did not complete/i)).toBeVisible();
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toBeEnabled();

    await act(async () => {
      fireEvent.click(retry);
    });

    const createCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        input === "/api/devices/provider-setups" &&
        (init as RequestInit | undefined)?.method === "POST",
    ).length;
    expect(createCalls).toBe(2);
  });

  it("renders a ready setup passed as initial state with a continue action", () => {
    render(
      <AIConnectionSetup
        organizationId={ORGANIZATION_ID}
        devices={[{ id: DEVICE_ID, name: "Studio Mac" }]}
        initialSetup={setupView({ status: "completed", stage: null })}
      />,
    );

    expect(screen.getByText("Ready")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(mocks.push).toHaveBeenCalledWith(
      `/onboarding/${ORGANIZATION_ID}/setup`,
    );
  });
});
