import { describe, expect, it, vi } from "vitest";
import { createOwnAiGenerator, type OwnAiDeps } from "./own-ai-generator";
import { OwnAiUnavailable } from "./screen-generator";

const request = { width: 480, height: 640, geometry: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 40 }] };
const input = { request, instruction: "A login screen" };
const SCREEN = "3f1c2b7a-1111-4111-8111-aaaaaaaaaaaa";

function deps(overrides: Partial<OwnAiDeps> = {}): OwnAiDeps {
  return {
    start: vi.fn(async () => ({ status: "queued" as const, taskId: "t1", screenId: SCREEN })),
    generation: vi.fn(async () => ({ versionId: "v1" })),
    taskStatus: vi.fn(async () => ({ status: "completed" as const, provider: "claude" })),
    loadDocument: vi.fn(async () => "<html><body>built</body></html>"),
    wait: async () => undefined,
    ...overrides,
  };
}
const make = (d: OwnAiDeps) => createOwnAiGenerator(d, { pollMs: 0, maxPolls: 6, maxWaitingPolls: 3 });

describe("createOwnAiGenerator", () => {
  it("queues with the sketch layout, waits for the version, and returns the page", async () => {
    const d = deps();
    const out = await make(d)(input);
    expect(d.start).toHaveBeenCalledWith(expect.objectContaining({ instruction: "A login screen", layout: expect.objectContaining({ boxes: expect.any(Array) }) }));
    expect(out).toEqual({ screenId: "own-3f1c2b7a", html: "<html><body>built</body></html>", provider: "claude" });
  });
  it("keeps polling while the task runs", async () => {
    let calls = 0;
    const d = deps({
      generation: vi.fn(async () => (++calls < 3 ? { versionId: null } : { versionId: "v1" })),
      taskStatus: vi.fn(async () => ({ status: "running" as const, provider: "codex" })),
    });
    expect((await make(d)(input)).provider).toBe("codex");
  });
  it.each([
    ["usage_limit_reached", "usage_limit"],
    ["needs_reauthentication", "needs_sign_in"],
    ["failed", "failed"],
    ["cancelled", "failed"],
    ["needs_review", "failed"],
  ] as const)("maps task status %s to %s", async (status, reason) => {
    const d = deps({ generation: vi.fn(async () => ({ versionId: null })), taskStatus: vi.fn(async () => ({ status, provider: "claude" })) });
    await expect(make(d)(input)).rejects.toMatchObject({ reason });
  });
  it("reports no connection when the queue refuses the task", async () => {
    const d = deps({ start: vi.fn(async () => ({ status: "error" as const, message: "no device" })) });
    await expect(make(d)(input)).rejects.toMatchObject({ reason: "no_connection" });
  });
  it("reports no connection when the device never picks the task up", async () => {
    const d = deps({ generation: vi.fn(async () => ({ versionId: null })), taskStatus: vi.fn(async () => ({ status: "waiting_for_device" as const, provider: "claude" })) });
    await expect(make(d)(input)).rejects.toMatchObject({ reason: "no_connection" });
  });
  it("times out when nothing finishes", async () => {
    const d = deps({ generation: vi.fn(async () => ({ versionId: null })), taskStatus: vi.fn(async () => ({ status: "running" as const, provider: "claude" })) });
    await expect(make(d)(input)).rejects.toMatchObject({ reason: "timeout" });
  });
  it("treats a version whose page cannot be loaded as a failure", async () => {
    const d = deps({ loadDocument: vi.fn(async () => null) });
    await expect(make(d)(input)).rejects.toBeInstanceOf(OwnAiUnavailable);
  });
  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(make(deps())({ ...input, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
