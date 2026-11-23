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
  it("accepts zoom and pinch with bounded numbers only", () => {
    const zoom = { source: "orion-frame", type: "zoom", x: 140, y: -60, deltaY: -12.5 };
    const pinch = { source: "orion-frame", type: "pinch", x: 0, y: 20000, scale: 0.5 };
    expect(from(zoom)).toEqual(zoom);
    expect(from(pinch)).toEqual(pinch);
    expect(from({ ...zoom, deltaY: 1000, x: -20000 })).not.toBeNull();
    expect(from({ ...pinch, scale: 2 })).not.toBeNull();
    for (const bad of [
      { ...zoom, deltaY: 1000.5 }, { ...zoom, deltaY: Number.NaN }, { ...zoom, x: 20001 }, { ...zoom, y: -20001 }, { ...zoom, y: Infinity },
      { ...zoom, x: "1" }, { ...zoom, extra: 1 }, { source: "orion-frame", type: "zoom", x: 1, y: 1 },
      { ...pinch, scale: 0.49 }, { ...pinch, scale: 2.01 }, { ...pinch, scale: 10 }, { ...pinch, scale: Number.NaN }, { ...pinch, deltaY: 1 },
    ]) expect(from(bad)).toBeNull();
    expect(from(zoom, {})).toBeNull();
  });
  const computed = { fontFamily: "Inter", fontSize: "16px", fontWeight: "400", color: "rgb(0, 0, 0)", backgroundColor: "rgb(255, 255, 255)", width: "100px", height: "40px", padding: "8px", gap: "4px", borderRadius: "6px", display: "flex" };
  const picked = { source: "orion-frame", type: "picked", epoch: 1, src: "a.tsx:0:10", label: "Hi" };

  it("accepts a picked message with a valid computed object", () => {
    expect(from({ ...picked, computed })).toMatchObject({ type: "picked", computed });
    expect(from(picked)).toMatchObject({ type: "picked" });
  });

  it("rejects computed objects with extra keys or over-long strings", () => {
    expect(from({ ...picked, computed: { ...computed, extra: "x" } })).toBeNull();
    expect(from({ ...picked, computed: { ...computed, fontFamily: "x".repeat(121) } })).toBeNull();
    expect(from({ ...picked, computed: { ...computed, fontSize: "x".repeat(13) } })).toBeNull();
    expect(from({ ...picked, computed: { ...computed, fontFamily: "x".repeat(120) } })).not.toBeNull();
  });

  it("accepts deselected", () => {
    expect(from({ source: "orion-frame", type: "deselected" })).toEqual({ source: "orion-frame", type: "deselected" });
    expect(from({ source: "orion-frame", type: "deselected", extra: 1 })).toBeNull();
  });

  it("strips odd characters from the font family so the caption only shows a font list", () => {
    const parsed = from({ ...picked, computed: { ...computed, fontFamily: '-apple-system, "Segoe UI", Noto_Sans 2.0' } });
    expect(parsed).toMatchObject({ computed: { fontFamily: '-apple-system, "Segoe UI", Noto_Sans 2.0' } });
    const hostile = from({ ...picked, computed: { ...computed, fontFamily: "Inter<script>\u202e;{}" } });
    expect(hostile).toMatchObject({ computed: { fontFamily: "Interscript" } });
  });
});
