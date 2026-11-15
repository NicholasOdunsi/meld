import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/version", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports the serving deployment and is never cached", async () => {
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_abc");
    const response = GET();
    expect(await response.json()).toEqual({ id: "dpl_abc" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("falls back to a fixed id locally so dev never reloads", async () => {
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "");
    delete process.env.VERCEL_DEPLOYMENT_ID;
    expect(await GET().json()).toEqual({ id: "local" });
  });
});
