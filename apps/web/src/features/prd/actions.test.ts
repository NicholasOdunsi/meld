import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPrdGenerateTask: vi.fn(),
  fakeGeneratePrd: vi.fn(),
  isDiscoveryFakeEnabled: vi.fn(),
}));

vi.mock("@/features/discovery/e2e-gate", () => ({
  isDiscoveryFakeEnabled: mocks.isDiscoveryFakeEnabled,
}));

vi.mock("./create-prd-generate-task", () => ({
  createPrdGenerateTask: mocks.createPrdGenerateTask,
}));

vi.mock("./e2e-fake", () => ({
  fakeGeneratePrd: mocks.fakeGeneratePrd,
}));

import { generatePrd } from "./actions";

const ROOM_ID = "40000000-0000-4000-8000-000000000001";

describe("generatePrd", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isDiscoveryFakeEnabled.mockReturnValue(false);
    mocks.createPrdGenerateTask.mockResolvedValue({
      id: "70000000-0000-4000-8000-000000000001",
      status: "queued",
    });
  });

  it("queues a production task and returns only its id", async () => {
    const result = await generatePrd({
      roomId: ROOM_ID,
      provider: "claude",
    });

    expect(mocks.createPrdGenerateTask).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      provider: "claude",
    });
    expect(result).toEqual({
      status: "queued",
      taskId: "70000000-0000-4000-8000-000000000001",
    });
    expect(result).not.toHaveProperty("result");
  });

  it("rejects invalid input without touching either task path", async () => {
    await expect(generatePrd({ roomId: "not-a-uuid" })).resolves.toEqual({
      status: "error",
      message: "Invalid request.",
    });
    expect(mocks.createPrdGenerateTask).not.toHaveBeenCalled();
    expect(mocks.fakeGeneratePrd).not.toHaveBeenCalled();
  });

  it("rejects unknown providers and extra request fields", async () => {
    const call = generatePrd as (input: unknown) => ReturnType<typeof generatePrd>;

    await expect(
      call({ roomId: ROOM_ID, provider: "unknown" }),
    ).resolves.toEqual({ status: "error", message: "Invalid request." });
    await expect(
      call({ roomId: ROOM_ID, exposeResult: true }),
    ).resolves.toEqual({ status: "error", message: "Invalid request." });
    expect(mocks.createPrdGenerateTask).not.toHaveBeenCalled();
  });

  it("surfaces a stable error when task creation fails", async () => {
    mocks.createPrdGenerateTask.mockRejectedValue(new Error("database detail"));

    await expect(generatePrd({ roomId: ROOM_ID })).resolves.toEqual({
      status: "error",
      message: "Could not start PRD generation.",
    });
  });

  it("uses the fake only behind the existing E2E gate", async () => {
    mocks.isDiscoveryFakeEnabled.mockReturnValue(true);
    mocks.fakeGeneratePrd.mockResolvedValue({
      id: "70000000-0000-4000-8000-000000000099",
      status: "queued",
    });

    await expect(generatePrd({ roomId: ROOM_ID })).resolves.toEqual({
      status: "queued",
      taskId: "70000000-0000-4000-8000-000000000099",
    });
    expect(mocks.fakeGeneratePrd).toHaveBeenCalledWith({ roomId: ROOM_ID });
    expect(mocks.createPrdGenerateTask).not.toHaveBeenCalled();
  });
});
