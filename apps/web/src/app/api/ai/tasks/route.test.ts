import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAITask: vi.fn(),
  createClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/features/ai/task-service", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/features/ai/task-service")
    >();
  return {
    ...original,
    createAITask: mocks.createAITask,
  };
});

import { POST } from "./route";

const INPUT = {
  roomId: "10000000-0000-4000-8000-000000000001",
  deviceId: "20000000-0000-4000-8000-000000000002",
  provider: "codex",
  kind: "room_reply",
  instruction: "Summarize the discussion.",
};

const TASK = {
  id: "70000000-0000-4000-8000-000000000007",
  initiatingUserId: "80000000-0000-4000-8000-000000000008",
  organizationId: "90000000-0000-4000-8000-000000000009",
  roomId: INPUT.roomId,
  deviceId: INPUT.deviceId,
  provider: INPUT.provider,
  kind: INPUT.kind,
  status: "queued",
  contextRevision: 0,
  createdAt: "2026-07-28T12:00:00.000Z",
  updatedAt: "2026-07-28T12:00:00.000Z",
};

function request(body: string | object) {
  return new Request("http://localhost/api/ai/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/ai/tasks", () => {
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
    mocks.createAITask.mockResolvedValue(TASK);
  });

  it("creates an authenticated AI task", async () => {
    const response = await POST(request(INPUT));

    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.any(Headers),
    );
    expect(mocks.createAITask).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.any(Object) }),
      INPUT,
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(TASK);
  });

  it("returns 400 for schema-invalid or malformed JSON", async () => {
    const invalidResponse = await POST(
      request({ ...INPUT, roomId: "not-a-uuid" }),
    );
    const malformedResponse = await POST(request("{"));

    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({
      error: "Invalid AI task request.",
    });
    expect(malformedResponse.status).toBe(400);
    await expect(malformedResponse.json()).resolves.toEqual({
      error: "Invalid AI task request.",
    });
    expect(mocks.createAITask).not.toHaveBeenCalled();
  });

  it("returns 401 when verified claims are missing", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });

    const response = await POST(request(INPUT));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
    expect(mocks.createAITask).not.toHaveBeenCalled();
  });

  it("returns a non-sensitive 409 for database conflicts", async () => {
    mocks.createAITask.mockRejectedValue(
      new Error(
        "permission denied: invalid_ai_task_request for user secret",
      ),
    );

    const response = await POST(request(INPUT));

    expect(response.status).toBe(409);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      error: "We could not create the AI task.",
    });
    expect(body).not.toContain("invalid_ai_task_request");
  });
});
