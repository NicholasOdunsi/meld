import { describe, expect, it, vi } from "vitest";
import { designScreenIdFromBoardId, resolveLiveSource } from "./live-source";

const UUID = "e5000000-0000-4000-8000-000000000001";
const VERSION = "e6000000-0000-4000-8000-000000000001";
const react = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };
const store = (html?: string) => ({ get: vi.fn(() => (html ? { id: `ds-${UUID}`, rev: 1, html } : undefined)) });

describe("designScreenIdFromBoardId", () => {
  it("reads the design screen id from a board screen id", () => {
    expect(designScreenIdFromBoardId(`ds-${UUID}`)).toBe(UUID);
    expect(designScreenIdFromBoardId("welcome")).toBeNull();
    expect(designScreenIdFromBoardId(`ds-${UUID}x`)).toBeNull();
  });
});

describe("resolveLiveSource", () => {
  it("uses the stored source of a react or html design screen and keeps its picture fresh", async () => {
    const readSource = vi.fn(async () => ({ status: "ok" as const, screen: { screenId: UUID, versionId: VERSION, formFactor: "mobile" as const, legacy: false as const, source: react, links: [] } }));
    await expect(resolveLiveSource(`ds-${UUID}`, { roomId: "room", store: store("<p>pic</p>"), readSource }))
      .resolves.toEqual({ source: react, snapshot: true });
    expect(readSource).toHaveBeenCalledWith(UUID);
  });

  it("runs a legacy design screen from its board HTML and never overwrites it", async () => {
    const readSource = vi.fn(async () => ({ status: "ok" as const, screen: { screenId: UUID, versionId: VERSION, formFactor: "desktop" as const, legacy: true as const } }));
    await expect(resolveLiveSource(`ds-${UUID}`, { roomId: "room", store: store("<h1>Old</h1>"), readSource }))
      .resolves.toEqual({ source: { kind: "html", files: { "index.html": "<h1>Old</h1>" }, entry: "index.html" }, snapshot: false });
  });

  it("never uses a saved snapshot as the source after a restore to legacy", async () => {
    const readSource = vi.fn(async () => ({ status: "ok" as const, screen: { screenId: UUID, versionId: VERSION, formFactor: "desktop" as const, legacy: true as const } }));
    const stored = { get: () => ({ id: `ds-${UUID}`, rev: 2, html: "<h1>Picture</h1>", snapshot: true as const }) };
    await expect(resolveLiveSource(`ds-${UUID}`, { roomId: "room", store: stored, readSource })).resolves.toBeNull();
  });

  it("runs a board-only screen from its HTML without asking the server", async () => {
    const readSource = vi.fn();
    await expect(resolveLiveSource("welcome", { roomId: null, store: store("<h1>Hi</h1>"), readSource }))
      .resolves.toMatchObject({ snapshot: false, source: { kind: "html" } });
    expect(readSource).not.toHaveBeenCalled();
  });

  it("gives up when the server read fails or there is nothing stored", async () => {
    const readSource = vi.fn(async () => ({ status: "error" as const }));
    await expect(resolveLiveSource(`ds-${UUID}`, { roomId: "room", store: store("<p>pic</p>"), readSource })).resolves.toBeNull();
    await expect(resolveLiveSource("welcome", { roomId: null, store: store(), readSource })).resolves.toBeNull();
  });
});
