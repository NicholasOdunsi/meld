import { ScreenSourceSchema, type ScreenSource } from "@meld/screen-runtime/source";
import type { convertBoardScreen, readScreenSource, saveScreenVersion } from "@/features/design/canvas-screen-source";
export type EditTarget = {
    kind: "versioned" | "legacy";
    screenId: string;
    versionId: string;
} | {
    kind: "board";
    roomId: string;
    boardId: string;
};
export type TargetRef = {
    current: EditTarget;
};
type Reply = Awaited<ReturnType<typeof saveScreenVersion>>;
export type VersionWriterDeps = {
    save: typeof saveScreenVersion;
    read: typeof readScreenSource;
};
type Uncertain = {
    id: string;
    source: ScreenSource;
    base: string | null;
    links: string[];
};
function sameFiles(left: Record<string, string>, right: Record<string, string>) {
    return Object.keys(left).length === Object.keys(right).length &&
        Object.entries(left).every(([key, value]) => Object.hasOwn(right, key) && right[key] === value);
}
function sameSource(left: ScreenSource, right: ScreenSource) {
    return left.kind === right.kind && left.entry === right.entry && sameFiles(left.files, right.files);
}
export function createVersionWriter(d: VersionWriterDeps) {
    let uncertain: Uncertain | null = null;
    async function write(id: string, source: ScreenSource, base: string | null, links: string[], retry?: true): Promise<Reply> {
        if (retry) {
            const previous = uncertain;
            if (!previous || previous.id !== id || previous.base !== base || !sameSource(previous.source, source))
                return { status: "error" };
            let head: Awaited<ReturnType<typeof readScreenSource>>;
            try {
                head = await d.read(id);
            }
            catch {
                return { status: "error" };
            }
            if (head.status !== "ok")
                return { status: "error" };
            if (head.screen.versionId !== base) {
                uncertain = null;
                return !head.screen.legacy && sameSource(head.screen.source, source)
                    ? { status: "saved", versionId: head.screen.versionId }
                    : { status: "conflict", versionId: head.screen.versionId };
            }
            // Replay the original links too; callers may have typed while the reply was lost.
            links = previous.links;
        }
        const capture: Uncertain = { id, source: { ...source, files: { ...source.files } }, base, links: [...links] };
        let result: Reply;
        try {
            result = await d.save({ screenId: id, baseVersionId: base, files: capture.source.files,
                kind: capture.source.kind, entry: capture.source.entry, links: capture.links });
        }
        catch {
            result = { status: "error" };
        }
        uncertain = result.status === "error" ? capture : null;
        return result;
    }
    return { write, hasUncertain: () => uncertain !== null };
}
export type PersistDeps = {
    name: string;
    formFactor: "mobile" | "tablet" | "desktop";
    links: (files: Record<string, string>) => Promise<string[]>;
    versionWriter: Pick<ReturnType<typeof createVersionWriter>, "write"> & Partial<Pick<ReturnType<typeof createVersionWriter>, "hasUncertain">>;
    convert: typeof convertBoardScreen;
    read: typeof readScreenSource;
    converted: (oldKey: string, screenId: string, versionId: string) => void;
};
export async function persistDraft(ref: TargetRef, source: ScreenSource, base: string | null, d: PersistDeps, retryUncertain?: true): Promise<Reply> {
    if (!ScreenSourceSchema.safeParse(source).success)
        return { status: "error" };
    let links: string[];
    try {
        links = await d.links(source.files);
    }
    catch {
        return { status: "error" };
    }
    const target = ref.current;
    if (target.kind === "board") {
        let created: Awaited<ReturnType<typeof convertBoardScreen>>;
        try {
            created = await d.convert({ roomId: target.roomId, boardId: target.boardId, name: d.name, formFactor: d.formFactor, source, links });
        }
        catch {
            return { status: "error" };
        }
        if (created.status !== "created")
            return { status: "error" };
        let result: Reply = { status: "saved", versionId: created.versionId };
        if (created.existing) {
            let head: Awaited<ReturnType<typeof readScreenSource>>;
            try {
                head = await d.read(created.screenId);
            }
            catch {
                return { status: "error" };
            }
            // Keep the original conversion target until this read succeeds, so Retry
            // resolves the durable mapping instead of issuing an unrelated save.
            if (head.status !== "ok")
                return { status: "error" };
            result = !head.screen.legacy && sameSource(head.screen.source, source)
                ? { status: "saved", versionId: head.screen.versionId }
                : { status: "conflict", versionId: head.screen.versionId };
        }
        const versionId = result.versionId ?? created.versionId;
        ref.current = { kind: "versioned", screenId: created.screenId, versionId };
        try {
            d.converted(target.boardId, created.screenId, versionId);
        }
        catch (error) {
            console.error("Canvas conversion scene reconciliation failed", error);
        }
        return result;
    }
    const result = await d.versionWriter.write(target.screenId, source, base, links, retryUncertain && d.versionWriter.hasUncertain?.() !== false ? true : undefined);
    if (result.status === "saved")
        ref.current = { kind: "versioned", screenId: target.screenId, versionId: result.versionId };
    return result;
}
