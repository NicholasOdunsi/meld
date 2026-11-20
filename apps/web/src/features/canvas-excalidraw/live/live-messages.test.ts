import { describe, expect, it } from "vitest";
import { MAX_SCREEN_HTML_CHARS } from "../board-persistence";
import { parseLiveFrameMessage } from "./live-messages";

const frame = {};
const from = (data: unknown, source: unknown = frame) => parseLiveFrameMessage({ source, data }, frame);

describe("parseLiveFrameMessage", () => {
  it("accepts every bridge message from the live frame", () => {
    for (const type of ["ready", "stuck", "escape"]) expect(from({ source: "orion-frame", type })).toEqual({ source: "orion-frame", type });
    expect(from({ source: "orion-frame", type: "error", message: "boom" })).toMatchObject({ type: "error", message: "boom" });
    expect(from({ source: "orion-frame", type: "goto", screenKey: "settings" })).toMatchObject({ type: "goto", screenKey: "settings" });
    expect(from({ source: "orion-frame", type: "snapshot", html: "<p>x</p>" })).toMatchObject({ type: "snapshot", html: "<p>x</p>" });
  });

  it("rejects other windows, no live frame, unknown shapes and oversized snapshots", () => {
    expect(from({ source: "orion-frame", type: "ready" }, {})).toBeNull();
    expect(parseLiveFrameMessage({ source: null, data: { source: "orion-frame", type: "ready" } }, null)).toBeNull();
    expect(from({ source: "other", type: "ready" })).toBeNull();
    expect(from({ source: "orion-frame", type: "ready", extra: 1 })).toBeNull();
    expect(from({ source: "orion-frame", type: "goto", screenKey: "Bad/Key" })).toBeNull();
    expect(from({ source: "orion-frame", type: "error", message: "x".repeat(501) })).toBeNull();
    expect(from({ source: "orion-frame", type: "snapshot", html: "x".repeat(MAX_SCREEN_HTML_CHARS + 1) })).toBeNull();
  });
});
