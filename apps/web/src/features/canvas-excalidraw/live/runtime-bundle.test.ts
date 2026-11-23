import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRuntimeBundle, resetRuntimeBundleForTests, RUNTIME_BUNDLE_URL } from "./runtime-bundle";

beforeEach(() => resetRuntimeBundleForTests());

describe("loadRuntimeBundle", () => {
  it("fetches the vendored runtime once", async () => {
    const fetcher = vi.fn(async () => new Response("/* runtime */"));
    await expect(loadRuntimeBundle(fetcher)).resolves.toBe("/* runtime */");
    await expect(loadRuntimeBundle(fetcher)).resolves.toBe("/* runtime */");
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(RUNTIME_BUNDLE_URL);
  });
  it("retries after a failed fetch", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(loadRuntimeBundle(fetcher)).rejects.toThrow("Could not load the screen runtime (500)");
    fetcher.mockResolvedValueOnce(new Response("ok"));
    await expect(loadRuntimeBundle(fetcher)).resolves.toBe("ok");
  });
});
