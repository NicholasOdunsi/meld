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
            .resolves.toEqual({ source: react, snapshot: true, target: { kind: "versioned", screenId: UUID, versionId: VERSION } });
        expect(readSource).toHaveBeenCalledWith(UUID);
    });
    it("runs a legacy design screen from its board HTML and never overwrites it", async () => {
        const readSource = vi.fn(async () => ({ status: "ok" as const, screen: { screenId: UUID, versionId: VERSION, formFactor: "desktop" as const, legacy: true as const } }));
        await expect(resolveLiveSource(`ds-${UUID}`, { roomId: "room", store: store("<h1>Old</h1>"), readSource }))
            .resolves.toEqual({ source: { kind: "html", files: { "index.html": "<h1>Old</h1>" }, entry: "index.html" }, snapshot: false, target: { kind: "legacy", screenId: UUID, versionId: VERSION } });
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
it("rebuilds a flagged legacy picture read-only and verifies the head twice", async () => {
    const legacy = { status: "ok" as const, screen: { legacy: true as const, screenId: UUID, versionId: VERSION, formFactor: "mobile" as const } };
    const readSource = vi.fn().mockResolvedValue(legacy);
    const loadLegacy = vi.fn().mockResolvedValue('<main>from restored markup</main><script>window.restored=1</script>');
    const stored = { get: () => ({ id: `ds-${UUID}`, rev: 1, html: "<main>old snapshot</main>", snapshot: true as const }) };
    const value = await resolveLiveSource(`ds-${UUID}`, { roomId: "room", store: stored, readSource, loadLegacy });
    expect(value?.source.files["index.html"]).toContain("window.restored=1");
    expect(value?.source.files["index.html"]).not.toContain("old snapshot");
    expect(value?.target).toEqual({ kind: "legacy", screenId: UUID, versionId: VERSION });
    expect(readSource).toHaveBeenCalledTimes(2);
    readSource.mockResolvedValueOnce(legacy).mockResolvedValueOnce({ ...legacy, screen: { ...legacy.screen, versionId: "new-head" } });
    expect(await resolveLiveSource(`ds-${UUID}`, { roomId: "room", store: stored, readSource, loadLegacy })).toBeNull();
});
it("recovers legacy without a board picture and does not persist it", async () => {
    const readSource = vi.fn().mockResolvedValue({ status: "ok", screen: { legacy: true, screenId: UUID, versionId: VERSION, formFactor: "mobile" } });
    const loadLegacy = vi.fn().mockResolvedValue("<main>restored</main>");
    expect(await resolveLiveSource(`ds-${UUID}`, { roomId: "room", store: store(), readSource, loadLegacy })).toMatchObject({ snapshot: false, source: { files: { "index.html": "<main>restored</main>" } } });
    expect(loadLegacy).toHaveBeenCalledWith(UUID, VERSION);
});
it("resolves durable mappings without creating and never grants a viewer an edit target", async () => {
    const readSource = vi.fn().mockResolvedValue({ status: "ok", screen: { legacy: false, screenId: UUID, versionId: VERSION, source: react, formFactor: "mobile", links: [] } });
    const readConversion = vi.fn().mockResolvedValue({ status: "ok", screenId: UUID });
    expect(await resolveLiveSource("old", { roomId: "room", store: store("old"), readSource, readConversion })).toMatchObject({ source: react, target: { kind: "versioned", screenId: UUID } });
    readConversion.mockClear();
    readSource.mockClear();
    expect(await resolveLiveSource("old", { roomId: "room", canEdit: false, store: store("old"), readSource, readConversion })).toMatchObject({ target: null });
    expect(readConversion).not.toHaveBeenCalled();
    expect(readSource).not.toHaveBeenCalled();
});
it("does not classify a mapping failure as a new board-only source", async () => {
    const readSource = vi.fn();
    const readConversion = vi.fn().mockResolvedValue({ status: "error" });
    expect(await resolveLiveSource("old", { roomId: "room", store: store("old"), readSource, readConversion })).toBeNull();
    expect(readSource).not.toHaveBeenCalled();
});
