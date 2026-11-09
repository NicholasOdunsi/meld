import { beforeEach, describe, expect, it, vi } from "vitest";

const { keepAlive, runMorningTodos } = vi.hoisted(() => ({
  keepAlive: vi.fn().mockResolvedValue(30),
  runMorningTodos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@meld/gateway/core", () => ({
  createTaskRepository: () => ({ getAiTaskLeaseSeconds: keepAlive }),
  createMorningRepository: vi.fn(() => ({})),
  createDeepSeekTodoWriter: vi.fn(() => ({ model: "m", write: vi.fn() })),
  DEEPSEEK_TODO_DEFAULT_MODEL: "deepseek-flash",
  runMorningTodos,
}));
vi.mock("./env", () => ({ createSupabase: () => ({}) }));

import { handleScheduled } from "./scheduled";

const baseEnv = { GATEWAY_SUPABASE_URL: "u", GATEWAY_SUPABASE_SERVICE_ROLE_KEY: "k" } as never;

describe("handleScheduled", () => {
  beforeEach(() => { keepAlive.mockClear(); runMorningTodos.mockClear(); });

  it("always keeps Supabase awake", async () => {
    await handleScheduled(baseEnv);
    expect(keepAlive).toHaveBeenCalledOnce();
  });

  it("skips morning to-dos when no DeepSeek key is set", async () => {
    await handleScheduled(baseEnv);
    expect(runMorningTodos).not.toHaveBeenCalled();
  });

  it("runs morning to-dos when the key is set", async () => {
    const now = new Date("2026-11-10T06:17:00Z");
    await handleScheduled({ ...(baseEnv as object), DEEPSEEK_API_KEY: "secret" } as never, { now: () => now });
    expect(runMorningTodos).toHaveBeenCalledWith(expect.objectContaining({ now }));
  });

  it("does not throw when the morning run fails", async () => {
    runMorningTodos.mockRejectedValueOnce(new Error("boom"));
    await expect(handleScheduled({ ...(baseEnv as object), DEEPSEEK_API_KEY: "secret" } as never)).resolves.toBeUndefined();
  });
});
