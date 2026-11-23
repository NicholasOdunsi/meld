import { describe, expect, it, vi } from "vitest";
import { createVersionWriter, persistDraft, type PersistDeps, type TargetRef } from "./edit-target";
const html = (text: string) => ({ kind: "html" as const, entry: "index.html", files: { "index.html": text } });
const loaded = (text: string, versionId: string) => ({ status: "ok" as const, screen: { legacy: false as const, screenId: "screen", versionId, formFactor: "mobile" as const, links: [], source: html(text) } });
describe("version writer", () => {
    it("reconciles only a new matching head after an uncertain save", async () => {
        const save = vi.fn().mockResolvedValue({ status: "error" });
        const read = vi.fn().mockResolvedValue(loaded("A", "v2"));
        const writer = createVersionWriter({ save, read });
        expect(await writer.write("screen", html("A"), "v1", [])).toEqual({ status: "error" });
        expect(await writer.write("screen", html("B"), "v1", [], true)).toEqual({ status: "error" });
        expect(read).not.toHaveBeenCalled();
        expect(await writer.write("screen", html("A"), "v1", [], true)).toEqual({ status: "saved", versionId: "v2" });
        expect(save).toHaveBeenCalledOnce();
    });
    it("retries unchanged base and retains busy conflicts", async () => {
        const save = vi.fn().mockResolvedValueOnce({ status: "error" }).mockResolvedValue({ status: "conflict", versionId: "v1" });
        const read = vi.fn().mockResolvedValue(loaded("A", "v1"));
        const writer = createVersionWriter({ save, read });
        await writer.write("screen", html("A"), "v1", []);
        expect(await writer.write("screen", html("A"), "v1", [], true)).toEqual({ status: "conflict", versionId: "v1" });
        expect(save).toHaveBeenCalledTimes(2);
    });
    it("keeps failed reads retryable and rejects divergent heads", async () => {
        const save = vi.fn().mockRejectedValue(new Error("lost"));
        const read = vi.fn().mockResolvedValueOnce({ status: "error" }).mockResolvedValue(loaded("other", "v2"));
        const writer = createVersionWriter({ save, read });
        await writer.write("screen", html("A"), "v1", []);
        expect(await writer.write("screen", html("A"), "v1", [], true)).toEqual({ status: "error" });
        expect(await writer.write("screen", html("A"), "v1", [], true)).toEqual({ status: "conflict", versionId: "v2" });
        expect(save).toHaveBeenCalledOnce();
    });
    it("never reconciles a definitive conflict", async () => {
        const save = vi.fn().mockResolvedValue({ status: "conflict", versionId: "v2" });
        const read = vi.fn().mockResolvedValue(loaded("A", "v2"));
        const writer = createVersionWriter({ save, read });
        expect(await writer.write("screen", html("A"), "v1", [])).toEqual({ status: "conflict", versionId: "v2" });
        expect(read).not.toHaveBeenCalled();
        expect(await writer.write("screen", html("A"), "v1", [], true)).toEqual({ status: "error" });
    });
    it("preserves immutable failed bytes and original legacy base", async () => {
        const save = vi.fn().mockResolvedValue({ status: "error" });
        const read = vi.fn().mockResolvedValue(loaded("A", "v2"));
        const writer = createVersionWriter({ save, read });
        const source = html("A");
        await writer.write("screen", source, "legacy", ["next"]);
        source.files["index.html"] = "B";
        expect(save).toHaveBeenCalledWith({ screenId: "screen", baseVersionId: "legacy", files: { "index.html": "A" }, kind: "html", entry: "index.html", links: ["next"] });
        expect(await writer.write("screen", html("A"), "legacy", [], true)).toEqual({ status: "saved", versionId: "v2" });
    });
});
function deps(): PersistDeps {
    return { name: "Screen", formFactor: "mobile", links: vi.fn().mockResolvedValue([]), versionWriter: { write: vi.fn().mockResolvedValue({ status: "saved", versionId: "v2" }) }, convert: vi.fn().mockResolvedValue({ status: "created", screenId: "screen", versionId: "v2", existing: false }), read: vi.fn().mockResolvedValue(loaded("A", "v2")), converted: vi.fn() };
}
describe("persistDraft", () => {
    it("converts a board source only on an actual write and publishes its alias", async () => {
        const d = deps();
        const ref: TargetRef = { current: { kind: "board", roomId: "room", boardId: "old" } };
        expect(await persistDraft(ref, html("A"), null, d)).toEqual({ status: "saved", versionId: "v2" });
        expect(ref.current).toEqual({ kind: "versioned", screenId: "screen", versionId: "v2" });
        expect(d.converted).toHaveBeenCalledWith("old", "screen", "v2");
        expect(d.versionWriter.write).not.toHaveBeenCalled();
    });
    it("compares existing conversion contents and retains mismatching drafts as conflict", async () => {
        const d = deps();
        vi.mocked(d.convert).mockResolvedValue({ status: "created", screenId: "screen", versionId: "v2", existing: true });
        const ref: TargetRef = { current: { kind: "board", roomId: "room", boardId: "old" } };
        expect(await persistDraft(ref, html("other"), null, d)).toEqual({ status: "conflict", versionId: "v2" });
        expect(d.versionWriter.write).not.toHaveBeenCalled();
    });
    it("recovers a failed mapping read on retry without creating a duplicate version", async () => {
        const d = deps();
        vi.mocked(d.convert).mockResolvedValue({ status: "created", screenId: "screen", versionId: "v2", existing: true });
        vi.mocked(d.read).mockResolvedValueOnce({ status: "error" }).mockResolvedValue(loaded("A", "v2"));
        const ref: TargetRef = { current: { kind: "board", roomId: "room", boardId: "old" } };
        expect(await persistDraft(ref, html("A"), null, d)).toEqual({ status: "error" });
        expect(await persistDraft(ref, html("A"), null, d, true)).toEqual({ status: "saved", versionId: "v2" });
        expect(d.versionWriter.write).not.toHaveBeenCalled();
    });
    it("keeps a durable save acknowledged when local scene publication throws", async () => {
        const d = deps();
        vi.mocked(d.converted).mockImplementation(() => {
            throw new Error("scene gone");
        });
        const ref: TargetRef = { current: { kind: "board", roomId: "room", boardId: "old" } };
        expect(await persistDraft(ref, html("A"), null, d)).toEqual({ status: "saved", versionId: "v2" });
        expect(ref.current.kind).toBe("versioned");
    });
    it("returns error before writing when links fail", async () => {
        const d = deps();
        vi.mocked(d.links).mockRejectedValue(new Error("worker gone"));
        const ref: TargetRef = { current: { kind: "legacy", screenId: "screen", versionId: "v1" } };
        expect(await persistDraft(ref, html("A"), "v1", d)).toEqual({ status: "error" });
        expect(d.versionWriter.write).not.toHaveBeenCalled();
    });
});
it("retries an ordinary link-extraction failure without pretending an RPC was uncertain", async () => {
  const d = deps();
  const save = vi.fn().mockResolvedValue({ status: "saved", versionId: "v2" });
  d.versionWriter = createVersionWriter({ save, read: d.read });
  vi.mocked(d.links).mockRejectedValueOnce(new Error("worker unavailable")).mockResolvedValue([]);
  const ref: TargetRef = { current: { kind: "versioned", screenId: "screen", versionId: "v1" } };
  expect(await persistDraft(ref, html("A"), "v1", d)).toEqual({ status: "error" });
  expect(await persistDraft(ref, html("A"), "v1", d, true)).toEqual({ status: "saved", versionId: "v2" });
  expect(save).toHaveBeenCalledOnce();
  expect(d.read).not.toHaveBeenCalled();
});
