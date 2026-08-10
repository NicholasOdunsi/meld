// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestCanvasSession: vi.fn(),
  useSync: vi.fn(),
  tldrawProps: null as Record<string, unknown> | null,
}));

vi.mock("./canvas-session", async () => {
  const actual = await vi.importActual<typeof import("./canvas-session")>("./canvas-session");
  return { ...actual, requestCanvasSession: mocks.requestCanvasSession };
});

vi.mock("@tldraw/sync", () => ({
  useSync: mocks.useSync,
}));

vi.mock("tldraw", () => ({
  computed: (_name: string, fn: () => unknown) => ({ get: fn }),
  createUserId: (value: string) => `user:${value}`,
  inlineBase64AssetStore: {},
  UserRecordType: { create: (value: unknown) => value },
  Tldraw: (props: Record<string, unknown>) => {
    mocks.tldrawProps = props;
    return <p data-testid="mock-tldraw">canvas</p>;
  },
}));

import { UserFlowTrialCanvas } from "./user-flow-trial-canvas";

const initialSession = {
  ticket: "first-ticket",
  gatewayUrl: "wss://gateway.example",
  access: "view" as const,
  expiresAt: 100,
};

const props = {
  organizationId: "30000000-0000-4000-8000-000000000003",
  roomId: "40000000-0000-4000-8000-000000000004",
  userId: "10000000-0000-4000-8000-000000000001",
  userName: "Viewer",
  access: "view" as const,
  trialEnabled: true,
};

beforeEach(() => {
  mocks.useSync.mockReturnValue({ status: "loading" });
  mocks.requestCanvasSession.mockResolvedValue({
    ...initialSession,
    ticket: "renewed-ticket",
  });
  process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY = "trial-license";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete window.__MELD_TLDRAW_TRIAL_EDITOR__;
  delete process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;
});

describe("UserFlowTrialCanvas", () => {
  it("renders loading and error states from useSync", () => {
    render(<UserFlowTrialCanvas {...props} />);
    expect(screen.getByTestId("user-flow-trial-canvas-loading")).toBeInTheDocument();

    cleanup();
    mocks.useSync.mockReturnValue({ status: "error", error: new Error("offline") });
    render(<UserFlowTrialCanvas {...props} />);
    expect(screen.getByTestId("user-flow-trial-canvas-error")).toBeInTheDocument();
  });

  it("passes the license and read-only guard while exposing the trial editor", () => {
    mocks.useSync.mockReturnValue({ status: "synced-remote", store: {} });
    const editor = {
      getIsReadonly: vi.fn().mockReturnValue(false),
      updateInstanceState: vi.fn(),
    };
    render(<UserFlowTrialCanvas {...props} />);

    expect(mocks.tldrawProps).toMatchObject({ licenseKey: "trial-license" });
    (mocks.tldrawProps?.onMount as (value: typeof editor) => void)(editor);
    expect(editor.updateInstanceState).toHaveBeenCalledWith({ isReadonly: true });
    expect(window.__MELD_TLDRAW_TRIAL_EDITOR__).toBe(editor);
  });

  it("renews the signed URI for reconnects", async () => {
    mocks.useSync.mockReturnValue({ status: "loading" });
    render(<UserFlowTrialCanvas {...props} />);
    const uri = mocks.useSync.mock.calls[0]?.[0]?.uri as () => Promise<string>;

    await expect(uri()).resolves.toBe(
      "wss://gateway.example/canvas/40000000-0000-4000-8000-000000000004?ticket=renewed-ticket",
    );
    await expect(uri()).resolves.toBe(
      "wss://gateway.example/canvas/40000000-0000-4000-8000-000000000004?ticket=renewed-ticket",
    );
    expect(mocks.requestCanvasSession).toHaveBeenCalledTimes(2);
  });
});
