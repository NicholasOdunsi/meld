import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PRDDocument } from "@meld/contracts";
import {
  PrdAcceptForbiddenError,
  PrdEditForbiddenError,
  PrdVersionConflictError,
} from "./repository";

const mocks = vi.hoisted(() => ({
  createPrdGenerateTask: vi.fn(),
  createPrdSectionAssistTask: vi.fn(),
  createPrdSectionReviseTask: vi.fn(),
  fakeGeneratePrd: vi.fn(),
  fakeAssistPrdSection: vi.fn(),
  fakeQueuePrdSectionRevision: vi.fn(),
  isRoomFakeEnabled: vi.fn(),
  getRoomBackend: vi.fn(),
  saveRoomPrdVersion: vi.fn(),
  acceptRoomPrdVersion: vi.fn(),
  dismissPrdAssistRequest: vi.fn(),
}));

vi.mock("@/features/rooms/e2e-gate", () => ({
  isRoomFakeEnabled: mocks.isRoomFakeEnabled,
}));

vi.mock("./create-prd-generate-task", () => ({
  createPrdGenerateTask: mocks.createPrdGenerateTask,
}));

vi.mock("./create-prd-section-assist-task", () => ({
  createPrdSectionAssistTask: mocks.createPrdSectionAssistTask,
}));

vi.mock("./create-prd-section-revise-task", () => ({
  createPrdSectionReviseTask: mocks.createPrdSectionReviseTask,
}));

vi.mock("./e2e-fake", () => ({
  fakeGeneratePrd: mocks.fakeGeneratePrd,
  fakeAssistPrdSection: mocks.fakeAssistPrdSection,
  fakeQueuePrdSectionRevision: mocks.fakeQueuePrdSectionRevision,
}));

vi.mock("@/features/rooms/backend", () => ({
  getRoomBackend: mocks.getRoomBackend,
}));

import {
  acceptPrdVersion,
  assistPrdSection,
  dismissPrdAssistRequest,
  generatePrd,
  revisePrdSection,
  savePrdVersion,
} from "./actions";

const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const PRD_ID = "50000000-0000-4000-8000-000000000001";
const USER_ID = "10000000-0000-4000-8000-000000000001";
const CLIENT_REQUEST_ID = "90000000-0000-4000-8000-000000000001";
const TASK_ID = "70000000-0000-4000-8000-000000000001";
const REQUEST_ID = "80000000-0000-4000-8000-000000000001";

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
  mocks.isRoomFakeEnabled.mockReturnValue(false);
  mocks.createPrdGenerateTask.mockResolvedValue({
    id: "70000000-0000-4000-8000-000000000001",
    status: "queued",
  });
  mocks.createPrdSectionAssistTask.mockResolvedValue({
    taskId: TASK_ID,
    requestId: REQUEST_ID,
  });
  mocks.createPrdSectionReviseTask.mockResolvedValue({
    id: TASK_ID,
    status: "queued",
  });
  mocks.getRoomBackend.mockResolvedValue({
    saveRoomPrdVersion: mocks.saveRoomPrdVersion,
    acceptRoomPrdVersion: mocks.acceptRoomPrdVersion,
    dismissPrdAssistRequest: mocks.dismissPrdAssistRequest,
  });
});

// Closing a settled request is housekeeping on the reader's own recovery list.
// It is the only writer of the `dismissed` status, so it has to reach the
// backend seam -- and it must never surface a failure, because a notice the
// reader has already closed is not something to interrupt them about.
describe("dismissPrdAssistRequest", () => {
  it("dismisses one request through the backend seam", async () => {
    mocks.dismissPrdAssistRequest.mockResolvedValue(undefined);

    await expect(
      dismissPrdAssistRequest({ roomId: ROOM_ID, requestId: REQUEST_ID }),
    ).resolves.toBeUndefined();
    expect(mocks.dismissPrdAssistRequest).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      requestId: REQUEST_ID,
    });
  });

  it.each([
    { roomId: "not-a-uuid", requestId: REQUEST_ID },
    { roomId: ROOM_ID, requestId: "not-a-uuid" },
  ])("rejects %j before reaching the backend", async (input) => {
    await dismissPrdAssistRequest(input);
    expect(mocks.dismissPrdAssistRequest).not.toHaveBeenCalled();
  });

  it("stays silent when the request is no longer dismissable", async () => {
    mocks.dismissPrdAssistRequest.mockRejectedValue(new Error("nope"));

    await expect(
      dismissPrdAssistRequest({ roomId: ROOM_ID, requestId: REQUEST_ID }),
    ).resolves.toBeUndefined();
  });
});

describe("assistPrdSection", () => {
  const sections = [
    {
      field: "executiveSummary",
      sectionLabel: "Executive summary",
      quotedText: "Reduce checkout friction.",
    },
    {
      field: "mvpScope",
      sectionLabel: "MVP scope",
      quotedText: "Mobile checkout summary",
    },
  ];

  const validInput = {
    roomId: ROOM_ID,
    clientRequestId: CLIENT_REQUEST_ID,
    sections,
    instruction: "Explain this and make the rationale clearer.",
  };

  it("queues one request and returns both of its ids", async () => {
    await expect(assistPrdSection(validInput)).resolves.toEqual({
      status: "queued",
      taskId: TASK_ID,
      requestId: REQUEST_ID,
    });
    // The RPC's own vocabulary is `label`, not `sectionLabel`.
    expect(mocks.createPrdSectionAssistTask).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      clientRequestId: CLIENT_REQUEST_ID,
      sections: [
        {
          field: "executiveSummary",
          label: "Executive summary",
          quotedText: "Reduce checkout friction.",
        },
        {
          field: "mvpScope",
          label: "MVP scope",
          quotedText: "Mobile checkout summary",
        },
      ],
      instruction: "Explain this and make the rationale clearer.",
      provider: undefined,
    });
  });

  it.each([
    ["a room id that is not a uuid", { roomId: "not-a-uuid" }],
    ["a client request id that is not a uuid", { clientRequestId: "replay-1" }],
    ["an empty selection", { sections: [] }],
    [
      "more than 15 selected sections",
      {
        sections: Array.from({ length: 16 }, (_unused, index) => ({
          field: "executiveSummary",
          sectionLabel: `Section ${index}`,
          quotedText: "Selected text",
        })),
      },
    ],
    [
      "a repeated field",
      {
        sections: [sections[0], { ...sections[0], quotedText: "Again" }],
      },
    ],
    ["sections outside rendered document order", { sections: [...sections].reverse() }],
    [
      "a field outside the PRD section allowlist",
      { sections: [{ ...sections[0], field: "notAField" }] },
    ],
    [
      "the title, which is never a selectable section",
      { sections: [{ ...sections[0], field: "title" }] },
    ],
    ["an empty quoted fragment", { sections: [{ ...sections[0], quotedText: "" }] }],
    [
      "a quoted fragment over 10,000 characters",
      { sections: [{ ...sections[0], quotedText: "x".repeat(10_001) }] },
    ],
    [
      "more than 20,000 selected characters in total",
      {
        sections: [
          { ...sections[0], quotedText: "x".repeat(10_000) },
          { ...sections[1], quotedText: "y".repeat(10_001) },
        ],
      },
    ],
    ["a blank instruction", { instruction: "   " }],
    ["an instruction over 20,000 characters", { instruction: "x".repeat(20_001) }],
    ["an unknown provider", { provider: "gemini" }],
    ["an extra request field", { canProposeEdit: true }],
    ["an extra section field", { sections: [{ ...sections[0], intent: "edit" }] }],
  ])("rejects %s before reaching the RPC", async (_name, overrides) => {
    const call = assistPrdSection as (
      input: unknown,
    ) => ReturnType<typeof assistPrdSection>;

    await expect(call({ ...validInput, ...overrides })).resolves.toEqual({
      status: "error",
      message: "Invalid request.",
    });
    expect(mocks.createPrdSectionAssistTask).not.toHaveBeenCalled();
    expect(mocks.fakeAssistPrdSection).not.toHaveBeenCalled();
  });

  it("accepts the exact boundary values the contract allows", async () => {
    await expect(
      assistPrdSection({
        ...validInput,
        sections: [
          { ...sections[0], quotedText: "x".repeat(10_000) },
          { ...sections[1], quotedText: "y".repeat(10_000) },
        ],
        instruction: "x".repeat(20_000),
      }),
    ).resolves.toMatchObject({ status: "queued" });
    expect(mocks.createPrdSectionAssistTask).toHaveBeenCalledTimes(1);
  });

  // The production path must contain no hand-written intent rules: the four
  // E2E fixture phrases queue exactly like any other instruction, because
  // classifying a request is the Product Agent's job.
  it.each([
    "Why did we choose this?",
    "Rewrite this for small teams.",
    "Explain this and make the rationale clearer.",
    "Fix this.",
    "Something no fixture ever mentions.",
  ])("queues %j without inspecting it", async (instruction) => {
    await expect(
      assistPrdSection({ ...validInput, instruction }),
    ).resolves.toEqual({
      status: "queued",
      taskId: TASK_ID,
      requestId: REQUEST_ID,
    });
    expect(mocks.createPrdSectionAssistTask).toHaveBeenCalledWith(
      expect.objectContaining({ instruction }),
    );
  });

  it("does not expose why queueing failed", async () => {
    mocks.createPrdSectionAssistTask.mockRejectedValue(
      new Error("invalid_prd_section_assist_request"),
    );

    await expect(assistPrdSection(validInput)).resolves.toEqual({
      status: "error",
      message: "Could not send this to the Product Agent.",
    });
  });

  it("uses the fake only behind the existing E2E gate", async () => {
    mocks.isRoomFakeEnabled.mockReturnValue(true);
    mocks.fakeAssistPrdSection.mockResolvedValue({
      taskId: TASK_ID,
      requestId: REQUEST_ID,
    });

    await expect(assistPrdSection(validInput)).resolves.toEqual({
      status: "queued",
      taskId: TASK_ID,
      requestId: REQUEST_ID,
    });
    expect(mocks.createPrdSectionAssistTask).not.toHaveBeenCalled();
  });
});

// Kept callable so a proposal queued through the old edit-only path can still
// be retried while in-flight prd_section_revise tasks drain. Task 8 removes it.
describe("revisePrdSection backward compatibility", () => {
  it("still queues a single-section revision task", async () => {
    await expect(
      revisePrdSection({
        roomId: ROOM_ID,
        field: "executiveSummary",
        sectionLabel: "Executive summary",
        instruction: "Make this clearer.",
        quotedText: "Reduce checkout friction.",
      }),
    ).resolves.toEqual({ status: "queued", taskId: TASK_ID });
    expect(mocks.createPrdSectionReviseTask).toHaveBeenCalledTimes(1);
    expect(mocks.createPrdSectionAssistTask).not.toHaveBeenCalled();
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
    mocks.isRoomFakeEnabled.mockReturnValue(true);
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

    expect(mocks.getRoomBackend).not.toHaveBeenCalled();
    expect(mocks.saveRoomPrdVersion).not.toHaveBeenCalled();
  });

  it("saves a validated document through the shared room backend", async () => {
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

    expect(mocks.getRoomBackend).not.toHaveBeenCalled();
    expect(mocks.acceptRoomPrdVersion).not.toHaveBeenCalled();
  });

  it("accepts a validated PRD through the shared room backend", async () => {
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
