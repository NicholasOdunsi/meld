import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelAITask: vi.fn(),
  createClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/features/ai/task-service", () => ({
  cancelAITask: mocks.cancelAITask,
}));

import { POST } from "./route";

const TASK_ID = "70000000-0000-4000-8000-000000000007";
const TASK = {
  id: TASK_ID,
  initiatingUserId: "80000000-0000-4000-8000-000000000008",
  workspaceId: "90000000-0000-4000-8000-000000000009",
  roomId: "10000000-0000-4000-8000-000000000001",
  deviceId: "20000000-0000-4000-8000-000000000002",
  provider: "codex",
  kind: "room_reply",
  status: "cancelled",
  contextRevision: 0,
  createdAt: "2026-07-28T12:00:00.000Z",
  updatedAt: "2026-07-28T12:01:00.000Z",
};

function request() {
  return new Request(
    `http://localhost/api/ai/tasks/${TASK_ID}/cancel`,
    { method: "POST" },
  );
}

function context(taskId = TASK_ID) {
  return { params: Promise.resolve({ taskId }) };
}

describe("POST /api/ai/tasks/:taskId/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "80000000-0000-4000-8000-000000000008",
        },
      },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
    });
    mocks.cancelAITask.mockResolvedValue(TASK);
  });

  it("cancels an authenticated AI task", async () => {
    const response = await POST(request(), context());

    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.any(Headers),
    );
    expect(mocks.cancelAITask).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.any(Object) }),
      TASK_ID,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ task: TASK });
  });

  it("returns 400 for an invalid task ID", async () => {
    const response = await POST(request(), context("not-a-uuid"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid AI task request.",
    });
    expect(mocks.cancelAITask).not.toHaveBeenCalled();
  });

  it("returns 401 when verified claims are missing", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(mocks.cancelAITask).not.toHaveBeenCalled();
  });

  it("returns a non-sensitive 409 for database conflicts", async () => {
    mocks.cancelAITask.mockRejectedValue(
      new Error("ai_task_not_owned: secret database details"),
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      error: "We could not cancel the AI task.",
    });
    expect(body).not.toContain("ai_task_not_owned");
  });
});
