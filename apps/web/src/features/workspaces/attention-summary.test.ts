import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isWorkspaceFakeEnabled: vi.fn(() => false),
  listFakeWorkspaceAttention: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./e2e-gate", () => ({
  isWorkspaceFakeEnabled: mocks.isWorkspaceFakeEnabled,
}));
vi.mock("./e2e-fake", () => ({
  listFakeWorkspaceAttention: mocks.listFakeWorkspaceAttention,
}));

import { listWorkspaceAttention } from "./attention-summary";

const FIRST_WORKSPACE_ID = "29000000-0000-4000-8000-000000000001";
const SECOND_WORKSPACE_ID = "29000000-0000-4000-8000-000000000002";

function withRpcResult(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  mocks.createClient.mockResolvedValue({ rpc });
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isWorkspaceFakeEnabled.mockReturnValue(false);
});

describe("listWorkspaceAttention", () => {
  it("reports only the workspaces the summary marks", async () => {
    const rpc = withRpcResult({
      data: [
        { workspace_id: FIRST_WORKSPACE_ID, has_attention: true },
        { workspace_id: SECOND_WORKSPACE_ID, has_attention: false },
      ],
      error: null,
    });

    const attention = await listWorkspaceAttention();

    expect(rpc).toHaveBeenCalledWith("list_workspace_attention");
    expect(attention.has(FIRST_WORKSPACE_ID)).toBe(true);
    expect(attention.has(SECOND_WORKSPACE_ID)).toBe(false);
  });

  it("drops a malformed row without letting it raise attention", async () => {
    withRpcResult({
      data: [
        { workspace_id: FIRST_WORKSPACE_ID, has_attention: "yes" },
        { workspace_id: SECOND_WORKSPACE_ID, has_attention: true },
      ],
      error: null,
    });

    const attention = await listWorkspaceAttention();

    expect(attention.has(FIRST_WORKSPACE_ID)).toBe(false);
    expect(attention.has(SECOND_WORKSPACE_ID)).toBe(true);
  });

  it("ignores a row that carries anything beyond the two allowed columns", async () => {
    withRpcResult({
      data: [
        {
          workspace_id: FIRST_WORKSPACE_ID,
          has_attention: true,
          room_id: "49000000-0000-4000-8000-000000000001",
        },
      ],
      error: null,
    });

    const attention = await listWorkspaceAttention();

    expect(attention.has(FIRST_WORKSPACE_ID)).toBe(false);
  });

  it("reports no attention when the summary cannot be read", async () => {
    withRpcResult({ data: null, error: { message: "permission internals" } });

    await expect(listWorkspaceAttention()).resolves.toEqual(new Set());
  });

  it("reports no attention when the response is not a row set", async () => {
    withRpcResult({ data: { workspace_id: FIRST_WORKSPACE_ID }, error: null });

    await expect(listWorkspaceAttention()).resolves.toEqual(new Set());
  });

  it("reads the seeded summary and opens no database client under the e2e fake", async () => {
    mocks.isWorkspaceFakeEnabled.mockReturnValue(true);
    mocks.listFakeWorkspaceAttention.mockResolvedValue(
      new Set([SECOND_WORKSPACE_ID]),
    );
    withRpcResult({
      data: [{ workspace_id: FIRST_WORKSPACE_ID, has_attention: true }],
      error: null,
    });

    await expect(listWorkspaceAttention()).resolves.toEqual(
      new Set([SECOND_WORKSPACE_ID]),
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("reports no attention when the database client cannot be opened", async () => {
    mocks.createClient.mockRejectedValue(new Error("no session"));

    await expect(listWorkspaceAttention()).resolves.toEqual(new Set());
  });
});
