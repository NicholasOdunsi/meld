import { describe, expect, it, vi } from "vitest";
import { postSketch } from "./post-sketch";

const request = { width: 480, height: 640, geometry: [] };

describe("postSketch", () => {
  it("returns the generated screen", async () => {
    const fetch = vi.fn(async () => Response.json({ screenId: "a-1234", html: "<p>x</p>" }));
    expect(await postSketch(request, fetch)).toEqual({ screenId: "a-1234", html: "<p>x</p>" });
    expect(fetch).toHaveBeenCalledWith("/api/dev/canvas-excalidraw/generate", expect.objectContaining({ method: "POST" }));
  });
  it("throws a readable error on failure and on a malformed reply", async () => {
    await expect(postSketch(request, vi.fn(async () => Response.json({ error: "http" }, { status: 502 })))).rejects.toThrow("http");
    await expect(postSketch(request, vi.fn(async () => Response.json({ nope: 1 })))).rejects.toThrow("malformed");
  });
});
