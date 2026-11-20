import type { ScreenSource } from "@meld/screen-runtime/source";
import type { readBoardConversion, readScreenSource } from "@/features/design/canvas-screen-source";
import type { ScreenStore } from "../screen-store";
import type { EditTarget } from "./edit-target";
// Only versioned sources may replace a board picture with a runtime snapshot.
export type LiveSource = {
    source: ScreenSource;
    snapshot: boolean;
    target?: EditTarget | null;
    revision?: number;
};
export type EditableLiveSource = LiveSource & {
    target: EditTarget | null;
};
const BOARD_DESIGN_ID = /^ds-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export function designScreenIdFromBoardId(boardScreenId: string): string | null {
    return BOARD_DESIGN_ID.exec(boardScreenId)?.[1] ?? null;
}
export async function resolveLiveSource(boardScreenId: string, deps: {
    roomId: string | null;
    canEdit?: boolean;
    store: Pick<ScreenStore, "get">;
    readSource: typeof readScreenSource;
    readConversion?: typeof readBoardConversion;
    loadLegacy?: (screenId: string, versionId: string) => Promise<string | null>;
}): Promise<EditableLiveSource | null> {
    let designId = designScreenIdFromBoardId(boardScreenId);
    const editable = !!deps.roomId && deps.canEdit !== false;
    try {
        if (!designId && editable && deps.readConversion) {
            const mapping = await deps.readConversion(deps.roomId!, boardScreenId);
            if (mapping.status !== "ok")
                return null;
            designId = mapping.screenId;
        }
        if (designId && deps.roomId) {
            const read = await deps.readSource(designId);
            if (read.status !== "ok")
                return null;
            const target: EditTarget | null = editable ? {
                kind: read.screen.legacy ? "legacy" : "versioned", screenId: designId, versionId: read.screen.versionId,
            } : null;
            if (!read.screen.legacy)
                return { source: read.screen.source, snapshot: true, target };
            const previous = deps.store.get(boardScreenId);
            if (previous?.snapshot || !previous?.html) {
                const html = await deps.loadLegacy?.(designId, read.screen.versionId);
                if (!html)
                    return null;
                const verified = await deps.readSource(designId);
                if (verified.status !== "ok" || !verified.screen.legacy || verified.screen.versionId !== read.screen.versionId)
                    return null;
                return { source: { kind: "html", files: { "index.html": html }, entry: "index.html" }, snapshot: false, target };
            }
            return { source: { kind: "html", files: { "index.html": previous.html }, entry: "index.html" }, snapshot: false, target };
        }
        const stored = deps.store.get(boardScreenId);
        if (!stored?.html || stored.snapshot)
            return null;
        return { source: { kind: "html", files: { "index.html": stored.html }, entry: "index.html" }, snapshot: false,
            target: editable ? { kind: "board", roomId: deps.roomId!, boardId: boardScreenId } : null };
    }
    catch {
        return null;
    }
}
