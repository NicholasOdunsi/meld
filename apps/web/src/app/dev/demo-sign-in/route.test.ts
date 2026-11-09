import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("demo sign-in", () => {
  it("does not exist outside demo mode", async () => {
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "");
    const response = await GET(new Request("http://localhost/dev/demo-sign-in"));
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not exist in production even with the flag", async () => {
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
    vi.stubEnv("NODE_ENV", "production");
    const response = await GET(new Request("http://localhost/dev/demo-sign-in"));
    expect(response.status).toBe(404);
  });

  it("signs in the demo owner and goes to the next page", async () => {
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
    const response = await GET(
      new Request("http://localhost/dev/demo-sign-in?next=/ws/inspiration"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/ws/inspiration");
    expect(response.headers.get("set-cookie")).toContain("meld-e2e-user-id=");
  });

  it("ignores an off-site next", async () => {
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
    const response = await GET(
      new Request("http://localhost/dev/demo-sign-in?next=//evil.example"),
    );
    expect(response.headers.get("location")).toBe(
      "/00000000-0000-4000-8000-000000000001",
    );
  });
});
