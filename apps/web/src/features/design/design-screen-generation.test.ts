import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  generateDesignScreen,
  getDesignScreenGeneration,
  listDesignScreenVersions,
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

  it("folds a serialized sketch layout into the instruction sent to the generate task", async () => {
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "create_design_screen") {
        return { data: { id: screenId }, error: null };
      }
      if (name === "create_design_screen_generate_task") {
        expect(args?.target_instruction).toContain("Build a login screen");
        expect(args?.target_instruction).toContain(
          'wide rectangle at bottom-center: "Start free trial"',
        );
        return { data: { id: taskId }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mocks.createClient.mockResolvedValue({ rpc });

    const layout = {
      boxes: [
        {
          shapeKind: "rectangle" as const,
          text: "Start free trial",
          position: { vertical: "bottom" as const, horizontal: "center" as const },
          size: { width: "wide" as const, height: "short" as const },
        },
      ],
      truncated: false,
    };

    await expect(
      generateDesignScreen({ roomId, instruction: "Build a login screen", layout }),
    ).resolves.toEqual({ status: "queued", taskId, screenId });

    expect(rpc).toHaveBeenCalledWith(
      "create_design_screen_generate_task",
      expect.objectContaining({ target_screen_id: screenId, target_provider: null }),
    );
  });

  it("folds downstream journey steps into the instruction sent to the generate task", async () => {
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "create_design_screen") {
        return { data: { id: screenId }, error: null };
      }
      if (name === "create_design_screen_generate_task") {
        const instruction = args?.target_instruction as string;
        expect(instruction).toContain("Build a login screen");
        expect(instruction).toContain("NEXT STEPS IN THE USER JOURNEY");
        expect(instruction).toContain("pick_plan: Pick a plan");
        return { data: { id: taskId }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mocks.createClient.mockResolvedValue({ rpc });

    const steps = [{ nodeId: "pick_plan", label: "Pick a plan" }];

    await expect(
      generateDesignScreen({ roomId, instruction: "Build a login screen", steps }),
    ).resolves.toEqual({ status: "queued", taskId, screenId });
  });

  it("embeds both the layout block and the NEXT STEPS block when both are supplied", async () => {
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "create_design_screen") {
        return { data: { id: screenId }, error: null };
      }
      if (name === "create_design_screen_generate_task") {
        const instruction = args?.target_instruction as string;
        expect(instruction).toContain(
          'wide rectangle at bottom-center: "Start free trial"',
        );
        expect(instruction).toContain("NEXT STEPS IN THE USER JOURNEY");
        expect(instruction).toContain("pick_plan: Pick a plan");
        return { data: { id: taskId }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mocks.createClient.mockResolvedValue({ rpc });

    const layout = {
      boxes: [
        {
          shapeKind: "rectangle" as const,
          text: "Start free trial",
          position: { vertical: "bottom" as const, horizontal: "center" as const },
          size: { width: "wide" as const, height: "short" as const },
        },
      ],
      truncated: false,
    };
    const steps = [{ nodeId: "pick_plan", label: "Pick a plan" }];

    await expect(
      generateDesignScreen({ roomId, instruction: "Build a login screen", layout, steps }),
    ).resolves.toEqual({ status: "queued", taskId, screenId });
  });

  it("budgets a long instruction so the full layout block survives within the 4000-char cap", async () => {
    const longInstruction = `${"Build a login screen. ".repeat(180)}`.slice(0, 3990); // near the 4000-char input cap on its own
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "create_design_screen") {
        return { data: { id: screenId }, error: null };
      }
      if (name === "create_design_screen_generate_task") {
        const instruction = args?.target_instruction as string;
        expect(instruction.length).toBeLessThanOrEqual(4000);
        expect(instruction).toContain(
          'wide rectangle at bottom-center: "Start free trial"',
        );
        expect(instruction.endsWith('wide rectangle at bottom-center: "Start free trial"')).toBe(
          true,
        );
        return { data: { id: taskId }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    mocks.createClient.mockResolvedValue({ rpc });

    const layout = {
      boxes: [
        {
          shapeKind: "rectangle" as const,
          text: "Start free trial",
          position: { vertical: "bottom" as const, horizontal: "center" as const },
          size: { width: "wide" as const, height: "short" as const },
        },
      ],
      truncated: false,
    };

    await expect(
      generateDesignScreen({ roomId, instruction: longInstruction, layout }),
    ).resolves.toEqual({ status: "queued", taskId, screenId });
  });

  it("leaves the instruction byte-identical when no layout is provided", async () => {
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

    expect(rpc).toHaveBeenNthCalledWith(2, "create_design_screen_generate_task", {
      target_screen_id: screenId,
      target_provider: null,
      target_instruction: "Build a login screen",
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

  it("treats an in-flight generation (null version_id and promoted) as running, not an error", async () => {
    // get_design_screen_generation LEFT JOINs onto design_screen_versions, so
    // while a generation is queued/running and no version has materialized
    // yet, version_id AND promoted come back as SQL null -- this is the
    // normal in-flight state, not a malformed row.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({
      data: [{ task_id: taskId, screen_id: screenId, version_id: null, promoted: null }],
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(getDesignScreenGeneration(taskId)).resolves.toEqual({
      taskId,
      screenId,
      versionId: null,
      promoted: null,
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
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

  it("lists a screen's versions newest first", async () => {
    const versionRow = { id: versionId, created_at: "2026-08-14T00:00:00Z", promoted: true };
    const order = vi.fn().mockResolvedValue({ data: [versionRow], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockResolvedValue({ from });

    await expect(listDesignScreenVersions(screenId)).resolves.toEqual([
      { id: versionId, createdAt: "2026-08-14T00:00:00Z", promoted: true },
    ]);
    expect(from).toHaveBeenCalledWith("design_screen_versions");
    expect(select).toHaveBeenCalledWith("id,created_at,promoted");
    expect(eq).toHaveBeenCalledWith("screen_id", screenId);
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns an empty version list on error or invalid screenId", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockResolvedValue({ from });

    await expect(listDesignScreenVersions(screenId)).resolves.toEqual([]);
    await expect(listDesignScreenVersions("not-a-uuid")).resolves.toEqual([]);
  });
});
