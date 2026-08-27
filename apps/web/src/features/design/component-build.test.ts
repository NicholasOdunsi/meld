import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc, from: mocks.from })),
}));

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
});

import {
  resolveComponentBuildRoomId,
  startComponentBuild,
} from "./component-build";

describe("startComponentBuild", () => {
  it("starts a pass for the room", async () => {
    mocks.rpc.mockResolvedValue({ data: "pass-id", error: null });

    await expect(
      startComponentBuild("20000000-0000-4000-8000-000000000001", "codex"),
    ).resolves.toEqual({ status: "started" });
    expect(mocks.rpc).toHaveBeenCalledWith("start_design_component_build", {
      target_room_id: "20000000-0000-4000-8000-000000000001",
      target_provider: "codex",
    });
  });

  it("reports a refusal without leaking the database error", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "no_active_design_system" },
    });

    await expect(
      startComponentBuild("20000000-0000-4000-8000-000000000001", "codex"),
    ).resolves.toEqual({
      status: "error",
      message: "Upload a design system before building its components.",
    });
  });

  // Every one of these used to come back as "Could not start the component
  // build.", which named neither the problem nor the fix.
  it.each([
    [
      "no_execution_device",
      "Connect an agent device before building components. Open Settings -> AI connections to pair one.",
    ],
    [
      "provider_not_connected",
      "Your paired device no longer has that AI provider connected. Open Settings -> AI connections to reconnect it.",
    ],
    [
      "design_system_not_editable",
      "You need edit access to this room to build its design system components.",
    ],
  ])("gives %s its own plain-language message", async (code, message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code } });

    await expect(
      startComponentBuild("20000000-0000-4000-8000-000000000001", "codex"),
    ).resolves.toEqual({ status: "error", message });
  });

  it("falls back to one neutral message for a refusal it does not recognise", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "some unrelated postgres failure" },
    });

    await expect(
      startComponentBuild("20000000-0000-4000-8000-000000000001", "codex"),
    ).resolves.toEqual({
      status: "error",
      message: "Could not start the component build.",
    });
  });

  it("rejects an id that is not a uuid", async () => {
    await expect(startComponentBuild("nope", "codex")).resolves.toMatchObject({
      status: "error",
    });
  });
});

describe("resolveComponentBuildRoomId", () => {
  it("prefers the room from an in-progress or finished build pass", async () => {
    mocks.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({
              data: [{ room_id: "40000000-0000-4000-8000-000000000001" }],
              error: null,
            }),
          }),
        }),
      }),
    });

    await expect(
      resolveComponentBuildRoomId("50000000-0000-4000-8000-000000000001"),
    ).resolves.toBe("40000000-0000-4000-8000-000000000001");
  });

  it("falls back to the distill that produced the active version", async () => {
    mocks.from
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { active_version_id: "30000000-0000-4000-8000-000000000001" },
              error: null,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: [{ room_id: "60000000-0000-4000-8000-000000000001" }],
              error: null,
            }),
          }),
        }),
      });

    await expect(
      resolveComponentBuildRoomId("50000000-0000-4000-8000-000000000001"),
    ).resolves.toBe("60000000-0000-4000-8000-000000000001");
  });

  it("returns null when nothing resolves a room", async () => {
    mocks.from
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { active_version_id: null }, error: null }),
          }),
        }),
      });

    await expect(
      resolveComponentBuildRoomId("50000000-0000-4000-8000-000000000001"),
    ).resolves.toBeNull();
  });

  it("rejects an id that is not a uuid", async () => {
    await expect(resolveComponentBuildRoomId("nope")).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
