import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  generateDesignScreen,
  getDesignScreenGeneration,
  listRoomDesignScreens,
  restoreDesignScreenVersion,
} from "./design-screen-generation";

const roomId = "40000000-0000-4000-8000-000000000004";
const screenId = "50000000-0000-4000-8000-000000000005";
const taskId = "70000000-0000-4000-8000-000000000007";
const versionId = "80000000-0000-4000-8000-000000000008";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("design screen generation actions", () => {
  it("creates a screen then fires the generate task when screenId is absent", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "create_design_screen") {
        return { data: { id: screenId }, error: null };
      }
      if (name === "create_design_screen_generate_task") {
        return { data: { id: taskId }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      generateDesignScreen({ roomId, instruction: "Build a login screen" }),
    ).resolves.toEqual({ status: "queued", taskId, screenId });

    expect(rpc).toHaveBeenNthCalledWith(1, "create_design_screen", {
      target_room_id: roomId,
      screen_name: "Screen",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "create_design_screen_generate_task", {
      target_screen_id: screenId,
      target_provider: null,
      target_instruction: "Build a login screen",
    });
  });

  it("skips screen creation when screenId is provided", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "create_design_screen_generate_task") {
        return { data: { id: taskId }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      generateDesignScreen({ roomId, screenId, instruction: "Tweak the header" }),
    ).resolves.toEqual({ status: "queued", taskId, screenId });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_design_screen_generate_task", {
      target_screen_id: screenId,
      target_provider: null,
      target_instruction: "Tweak the header",
    });
  });

  it("returns an error result when screen creation fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      generateDesignScreen({ roomId, instruction: "Build a login screen" }),
    ).resolves.toEqual({
      status: "error",
      message: "We could not start screen generation.",
    });
  });

  it("returns an error result for invalid input", async () => {
    await expect(
      generateDesignScreen({ roomId: "not-a-uuid", instruction: "x" }),
    ).resolves.toEqual({
      status: "error",
      message: "We could not start screen generation.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("reads back a generation by task id", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ task_id: taskId, screen_id: screenId, version_id: versionId, promoted: true }],
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(getDesignScreenGeneration(taskId)).resolves.toEqual({
      taskId,
      screenId,
      versionId,
      promoted: true,
    });
    expect(rpc).toHaveBeenCalledWith("get_design_screen_generation", {
      target_task_id: taskId,
    });
  });

  it("returns null when the generation readback is empty or malformed", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    await expect(getDesignScreenGeneration(taskId)).resolves.toBeNull();

    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
    });
    await expect(getDesignScreenGeneration(taskId)).resolves.toBeNull();

    await expect(getDesignScreenGeneration("not-a-uuid")).resolves.toBeNull();
  });

  it("restores a version", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: versionId }, error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      restoreDesignScreenVersion({ screenId, versionId }),
    ).resolves.toEqual({ status: "restored", versionId });
    expect(rpc).toHaveBeenCalledWith("restore_design_screen_version", {
      target_screen_id: screenId,
      target_version_id: versionId,
    });
  });

  it("returns an error result when restore fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      restoreDesignScreenVersion({ screenId, versionId }),
    ).resolves.toEqual({ status: "error", message: "Could not restore." });
  });

  it("lists a room's design screens", async () => {
    const screenRow = {
      id: screenId,
      name: "Login",
      state: "built",
      updating: false,
      current_version_id: versionId,
    };
    const order = vi.fn().mockResolvedValue({ data: [screenRow], error: null });
    const is = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ is }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockResolvedValue({ from });

    await expect(listRoomDesignScreens(roomId)).resolves.toEqual([screenRow]);
    expect(from).toHaveBeenCalledWith("design_screens");
    expect(select).toHaveBeenCalledWith(
      "id,name,state,updating,current_version_id",
    );
    expect(eq).toHaveBeenCalledWith("room_id", roomId);
    expect(is).toHaveBeenCalledWith("deleted_at", null);
    expect(order).toHaveBeenCalledWith("canvas_x", { ascending: true });
  });

  it("returns an empty list on error or invalid roomId", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const is = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ is }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockResolvedValue({ from });

    await expect(listRoomDesignScreens(roomId)).resolves.toEqual([]);
    await expect(listRoomDesignScreens("not-a-uuid")).resolves.toEqual([]);
  });
});
