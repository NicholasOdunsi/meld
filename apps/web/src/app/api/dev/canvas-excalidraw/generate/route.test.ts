import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const body = { width: 480, height: 640, geometry: [{ type: "rectangle", x: 0, y: 0, width: 10, height: 10 }] };
const post = (payload: unknown) =>
  POST(new Request("http://x/api", { method: "POST", body: JSON.stringify(payload) }));

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/dev/canvas-excalidraw/generate", () => {
  it("is not found outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await post(body)).status).toBe(404);
  });
  it("rejects an invalid body", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await post({ width: 1 })).status).toBe(400);
  });
  it("returns a fixture screen in fake mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
    const response = await post(body);
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.screenId).toMatch(/^generated-/);
    expect(json.html).toContain("Generated screen");
  });
  it("needs an API key outside fake mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "false");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    expect((await post(body)).status).toBe(503);
  });
});
