import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isRoomFakeEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({
  isRoomFakeEnabled: mocks.isRoomFakeEnabled,
}));

import {
  clearDesignScreenActionLink,
  setDesignScreenActionLink,
} from "./design-screen-links";

const SOURCE = "a0000000-0000-4000-8000-00000000000a";
const TARGET = "b0000000-0000-4000-8000-00000000000b";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isRoomFakeEnabled.mockReturnValue(false);
});

describe("setDesignScreenActionLink", () => {
  it("upserts the override via the RPC with the source screen as target_screen_id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      setDesignScreenActionLink({
        sourceScreenId: SOURCE,
        actionId: "go",
        targetScreenId: TARGET,
      }),
    ).resolves.toEqual({ status: "linked" });

    expect(rpc).toHaveBeenCalledWith("set_design_screen_action_link", {
      target_screen_id: SOURCE,
      target_action_id: "go",
      target_link_screen_id: TARGET,
    });
  });

  it("returns linked without a round trip in fake mode", async () => {
    mocks.isRoomFakeEnabled.mockReturnValue(true);

    await expect(
      setDesignScreenActionLink({
        sourceScreenId: SOURCE,
        actionId: "go",
        targetScreenId: TARGET,
      }),
    ).resolves.toEqual({ status: "linked" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects a self link before querying", async () => {
    await expect(
      setDesignScreenActionLink({
        sourceScreenId: SOURCE,
        actionId: "go",
        targetScreenId: SOURCE,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "We could not link these screens.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid action id before querying", async () => {
    await expect(
      setDesignScreenActionLink({
        sourceScreenId: SOURCE,
        actionId: "Not Valid",
        targetScreenId: TARGET,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "We could not link these screens.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("surfaces an error when the RPC fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "denied" } });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      setDesignScreenActionLink({
        sourceScreenId: SOURCE,
        actionId: "go",
        targetScreenId: TARGET,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "We could not link these screens.",
    });
    error.mockRestore();
  });
});

describe("clearDesignScreenActionLink", () => {
  it("deletes the override via the RPC keyed on source screen + action", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      clearDesignScreenActionLink({ sourceScreenId: SOURCE, actionId: "go" }),
    ).resolves.toEqual({ status: "cleared" });

    expect(rpc).toHaveBeenCalledWith("clear_design_screen_action_link", {
      target_screen_id: SOURCE,
      target_action_id: "go",
    });
  });

  it("returns cleared without a round trip in fake mode", async () => {
    mocks.isRoomFakeEnabled.mockReturnValue(true);

    await expect(
      clearDesignScreenActionLink({ sourceScreenId: SOURCE, actionId: "go" }),
    ).resolves.toEqual({ status: "cleared" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid input before querying", async () => {
    await expect(
      clearDesignScreenActionLink({ sourceScreenId: "nope", actionId: "go" }),
    ).resolves.toEqual({
      status: "error",
      message: "We could not unlink these screens.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("surfaces an error when the RPC fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "denied" } });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      clearDesignScreenActionLink({ sourceScreenId: SOURCE, actionId: "go" }),
    ).resolves.toEqual({
      status: "error",
      message: "We could not unlink these screens.",
    });
    error.mockRestore();
  });
});
