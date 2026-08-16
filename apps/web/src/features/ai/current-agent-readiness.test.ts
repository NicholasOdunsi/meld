import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  resolveAgentReadiness: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/features/ai/agent-readiness", () => ({
  resolveAgentReadiness: mocks.resolveAgentReadiness,
}));

import { getCurrentAgentReadiness } from "./current-agent-readiness";

it("resolves readiness directly for a Server Component render", async () => {
  const supabase = { rpc: vi.fn() };
  const readiness = {
    ready: true as const,
    defaultProvider: "claude" as const,
    defaultDeviceId: "device-1",
    providers: [],
  };
  mocks.createClient.mockResolvedValue(supabase);
  mocks.resolveAgentReadiness.mockResolvedValue(readiness);

  await expect(getCurrentAgentReadiness()).resolves.toEqual(readiness);
  expect(mocks.createClient).toHaveBeenCalledOnce();
  expect(mocks.resolveAgentReadiness).toHaveBeenCalledWith(supabase);
});
