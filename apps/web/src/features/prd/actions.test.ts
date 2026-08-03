import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PRDDocument } from "@meld/contracts";
import {
  PrdAcceptForbiddenError,
  PrdEditForbiddenError,
  PrdVersionConflictError,
} from "./repository";

const mocks = vi.hoisted(() => ({
  createPrdGenerateTask: vi.fn(),
  fakeGeneratePrd: vi.fn(),
  isDiscoveryFakeEnabled: vi.fn(),
  getDiscoveryBackend: vi.fn(),
  saveRoomPrdVersion: vi.fn(),
  acceptRoomPrdVersion: vi.fn(),
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

vi.mock("@/features/discovery/backend", () => ({
  getDiscoveryBackend: mocks.getDiscoveryBackend,
}));

import { acceptPrdVersion, generatePrd, savePrdVersion } from "./actions";

const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const PRD_ID = "50000000-0000-4000-8000-000000000001";
const USER_ID = "10000000-0000-4000-8000-000000000001";

const document: PRDDocument = {
  title: "Checkout redesign",
  executiveSummary: "",
  problemAndEvidence: "",
  targetUsersAndUseCases: "",
  goalsNonGoalsAndMetrics: "",
  proposedSolution: "",
  userJourneys: "",
  functionalRequirements: [],
  nonFunctionalRequirements: [],
  uxStatesAndEdgeCases: [],
  dependenciesAndConstraints: [],
  risksAndMitigations: [],
  mvpScope: { included: [], excluded: [] },
  acceptanceCriteria: [],
  openQuestions: [],
  decisionHistory: [],
};

const savedPrd = {
  id: PRD_ID,
  roomId: ROOM_ID,
  version: 2,
  status: "draft" as const,
  document,
  ownerId: USER_ID,
  createdBy: USER_ID,
  acceptedAt: null,
  acceptedBy: null,
  createdAt: "2026-08-03T10:00:00.000Z",
  updatedAt: "2026-08-03T10:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isDiscoveryFakeEnabled.mockReturnValue(false);
  mocks.createPrdGenerateTask.mockResolvedValue({
    id: "70000000-0000-4000-8000-000000000001",
    status: "queued",
  });
  mocks.getDiscoveryBackend.mockResolvedValue({
    saveRoomPrdVersion: mocks.saveRoomPrdVersion,
    acceptRoomPrdVersion: mocks.acceptRoomPrdVersion,
  });
});

describe("generatePrd", () => {
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

describe("savePrdVersion", () => {
  it("rejects malformed, incomplete, and extra input without reaching the backend", async () => {
    const call = savePrdVersion as (input: unknown) => ReturnType<typeof savePrdVersion>;

    await expect(
      call({ roomId: "bad", baseVersion: 0, document: {} }),
    ).resolves.toEqual({ status: "error", message: "Invalid request." });
    await expect(
      call({ roomId: ROOM_ID, baseVersion: 1.5, document }),
    ).resolves.toEqual({ status: "error", message: "Invalid request." });
    await expect(
      call({ roomId: ROOM_ID, baseVersion: 1, document, extra: true }),
    ).resolves.toEqual({ status: "error", message: "Invalid request." });

    expect(mocks.getDiscoveryBackend).not.toHaveBeenCalled();
    expect(mocks.saveRoomPrdVersion).not.toHaveBeenCalled();
  });

  it("saves a validated document through the shared discovery backend", async () => {
    mocks.saveRoomPrdVersion.mockResolvedValue(savedPrd);

    await expect(
      savePrdVersion({ roomId: ROOM_ID, baseVersion: 1, document }),
    ).resolves.toEqual({ status: "saved", prd: savedPrd });
    expect(mocks.saveRoomPrdVersion).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      baseVersion: 1,
      document,
    });
  });

  it("returns the latest version for a stale save", async () => {
    mocks.saveRoomPrdVersion.mockRejectedValue(new PrdVersionConflictError(3));

    await expect(
      savePrdVersion({ roomId: ROOM_ID, baseVersion: 1, document }),
    ).resolves.toEqual({ status: "conflict", currentVersion: 3 });
  });

  it("returns a stable error when editing is rejected", async () => {
    mocks.saveRoomPrdVersion.mockRejectedValue(new PrdEditForbiddenError());

    await expect(
      savePrdVersion({ roomId: ROOM_ID, baseVersion: 1, document }),
    ).resolves.toEqual({
      status: "error",
      message: "You do not have permission to edit this PRD.",
    });
  });

  it("does not expose persistence failures", async () => {
    mocks.saveRoomPrdVersion.mockRejectedValue(new Error("database detail"));

    await expect(
      savePrdVersion({ roomId: ROOM_ID, baseVersion: 1, document }),
    ).resolves.toEqual({
      status: "error",
      message: "Could not save the PRD version.",
    });
  });
});

describe("acceptPrdVersion", () => {
  it("rejects invalid IDs and extra fields without reaching the backend", async () => {
    const call = acceptPrdVersion as (input: unknown) => ReturnType<typeof acceptPrdVersion>;

    await expect(
      call({ roomId: ROOM_ID, prdId: "bad", extra: true }),
    ).resolves.toEqual({ status: "error", message: "Invalid request." });

    expect(mocks.getDiscoveryBackend).not.toHaveBeenCalled();
    expect(mocks.acceptRoomPrdVersion).not.toHaveBeenCalled();
  });

  it("accepts a validated PRD through the shared discovery backend", async () => {
    const acceptedPrd = {
      ...savedPrd,
      status: "accepted" as const,
      acceptedAt: "2026-08-03T11:00:00.000Z",
      acceptedBy: USER_ID,
    };
    mocks.acceptRoomPrdVersion.mockResolvedValue(acceptedPrd);

    await expect(
      acceptPrdVersion({ roomId: ROOM_ID, prdId: PRD_ID }),
    ).resolves.toEqual({ status: "accepted", prd: acceptedPrd });
    expect(mocks.acceptRoomPrdVersion).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      prdId: PRD_ID,
    });
  });

  it("returns a stable error when acceptance is rejected", async () => {
    mocks.acceptRoomPrdVersion.mockRejectedValue(new PrdAcceptForbiddenError());

    await expect(
      acceptPrdVersion({ roomId: ROOM_ID, prdId: PRD_ID }),
    ).resolves.toEqual({
      status: "error",
      message: "You do not have permission to accept this PRD.",
    });
  });

  it("does not expose persistence failures", async () => {
    mocks.acceptRoomPrdVersion.mockRejectedValue(new Error("database detail"));

    await expect(
      acceptPrdVersion({ roomId: ROOM_ID, prdId: PRD_ID }),
    ).resolves.toEqual({
      status: "error",
      message: "Could not accept the PRD version.",
    });
  });
});
