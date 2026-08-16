import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import { deleteDesignScreen, restoreDesignScreen } from "./design-screen-delete";

const SCREEN_ID = "80000000-0000-4000-8000-000000000008";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteDesignScreen", () => {
  it("maps a successful delete to status deleted", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(deleteDesignScreen(SCREEN_ID)).resolves.toEqual({
      status: "deleted",
    });
    expect(rpc).toHaveBeenCalledWith("delete_design_screen", {
      target_screen_id: SCREEN_ID,
    });
  });

  it("maps an RPC error to status error", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    mocks.createClient.mockResolvedValue({ rpc });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(deleteDesignScreen(SCREEN_ID)).resolves.toEqual({
      status: "error",
    });
    consoleError.mockRestore();
  });

  it("maps an invalid id to status error without calling the RPC", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(deleteDesignScreen("not-a-uuid")).resolves.toEqual({
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a thrown RPC rejection to status error", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("network down");
    });
    mocks.createClient.mockResolvedValue({ rpc });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(deleteDesignScreen(SCREEN_ID)).resolves.toEqual({
      status: "error",
    });
    consoleError.mockRestore();
  });
});

describe("restoreDesignScreen", () => {
  it("maps a successful restore to status restored", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(restoreDesignScreen(SCREEN_ID)).resolves.toEqual({
      status: "restored",
    });
    expect(rpc).toHaveBeenCalledWith("restore_design_screen", {
      target_screen_id: SCREEN_ID,
    });
  });

  it("maps an RPC error to status error", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    mocks.createClient.mockResolvedValue({ rpc });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(restoreDesignScreen(SCREEN_ID)).resolves.toEqual({
      status: "error",
    });
    consoleError.mockRestore();
  });

  it("maps an invalid id to status error without calling the RPC", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(restoreDesignScreen("not-a-uuid")).resolves.toEqual({
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a thrown RPC rejection to status error", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("network down");
    });
    mocks.createClient.mockResolvedValue({ rpc });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(restoreDesignScreen(SCREEN_ID)).resolves.toEqual({
      status: "error",
    });
    consoleError.mockRestore();
  });
});
