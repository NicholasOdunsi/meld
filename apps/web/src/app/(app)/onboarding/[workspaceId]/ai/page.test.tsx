import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkspaceMembership: vi.fn(),
  listDevices: vi.fn(),
  isDeviceFakeEnabled: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/features/workspaces/workspace-people", () => ({
  requireWorkspaceMembership: mocks.requireWorkspaceMembership,
}));

vi.mock("@/features/ai/device-service", () => ({
  listDevices: mocks.listDevices,
}));

vi.mock("@/features/ai/e2e-gate", () => ({
  isDeviceFakeEnabled: mocks.isDeviceFakeEnabled,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

// A no-op stand-in for the client component keeps the server page unit test
// off the DOM; the props it would receive are read straight off the element.
vi.mock("@/features/ai/components/ai-connection-setup", () => ({
  AIConnectionSetup: () => null,
}));

import AIConnectionOnboardingPage from "./page";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const DEVICE_ID = "20000000-0000-4000-8000-000000000002";

type ConnectionProps = {
  workspaceId: string;
  devices: { id: string; name: string }[];
};

function activeDevice() {
  return {
    id: DEVICE_ID,
    name: "Studio Mac",
    platform: "darwin",
    status: "active",
    connectorVersion: null,
    lastSeenAt: null,
    createdAt: "2026-07-29T12:00:00.000Z",
    providers: [],
  };
}

async function renderPage() {
  const element = await AIConnectionOnboardingPage({
    params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
  });
  return element.props as ConnectionProps;
}

describe("AIConnectionOnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceMembership.mockResolvedValue(undefined);
    mocks.isDeviceFakeEnabled.mockReturnValue(false);
    mocks.createClient.mockResolvedValue({});
    mocks.listDevices.mockResolvedValue([activeDevice()]);
  });

  it("enforces workspace membership before rendering the step", async () => {
    await renderPage();

    expect(mocks.requireWorkspaceMembership).toHaveBeenCalledWith(
      WORKSPACE_ID,
      `/onboarding/${WORKSPACE_ID}/ai`,
    );
  });

  it("rejects and loads no devices when membership is denied", async () => {
    mocks.requireWorkspaceMembership.mockRejectedValue(
      new Error("NEXT_NOT_FOUND"),
    );

    await expect(
      AIConnectionOnboardingPage({
        params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
      }),
    ).rejects.toThrow();
    expect(mocks.listDevices).not.toHaveBeenCalled();
  });

  it("passes the org and its active devices to the connection UI", async () => {
    const props = await renderPage();

    expect(props.workspaceId).toBe(WORKSPACE_ID);
    expect(props.devices).toEqual([{ id: DEVICE_ID, name: "Studio Mac" }]);
  });

  it("omits revoked devices from the connection UI", async () => {
    mocks.listDevices.mockResolvedValue([
      activeDevice(),
      {
        ...activeDevice(),
        id: "20000000-0000-4000-8000-000000000099",
        status: "revoked",
      },
    ]);

    const props = await renderPage();

    expect(props.devices).toEqual([{ id: DEVICE_ID, name: "Studio Mac" }]);
  });
});
