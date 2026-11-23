"use server";

import { z } from "zod";
import { SCREEN_KINDS, SCREEN_PATH, ScreenFilesSchema, ScreenSourceSchema, type ScreenKind, type ScreenSource } from "@meld/screen-runtime/source";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";

const Id = z.string().uuid();
const FormFactor = z.enum(["mobile", "tablet", "desktop"]);
const Links = z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)).max(100);
const Entry = z.string().regex(SCREEN_PATH).refine((path) => !path.includes(".."));
const SavedRow = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), versionId: Id }),
  z.object({ status: z.literal("conflict"), versionId: Id.nullable() }),
]);

export type CreateCanvasScreenResult = { status: "created"; screenId: string; versionId: string } | { status: "error" };
export type SaveScreenVersionResult = { status: "saved"; versionId: string } | { status: "conflict"; versionId: string | null } | { status: "error" };
export type ScreenVersionSummary = { id: string; createdAt: string; kind: "legacy" | ScreenKind };
export type LoadedScreenSource =
  | { screenId: string; versionId: string; formFactor: "mobile" | "tablet" | "desktop"; legacy: false; source: ScreenSource; links: string[] }
  | { screenId: string; versionId: string; formFactor: "mobile" | "tablet" | "desktop"; legacy: true };

function fail(operation: string, reason: unknown) {
  console.error(`canvas screen ${operation} failed:`, reason instanceof Error ? reason.message : reason);
}

export async function createCanvasScreen(input: {
  roomId: string; name: string; source: ScreenSource; formFactor: "mobile" | "tablet" | "desktop";
}): Promise<CreateCanvasScreenResult> {
  const roomId = Id.safeParse(input.roomId);
  const source = ScreenSourceSchema.safeParse(input.source);
  const formFactor = FormFactor.safeParse(input.formFactor);
  const name = z.string().trim().min(1).max(120).safeParse(input.name);
  if (!roomId.success || !source.success || !formFactor.success || !name.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeCreate } = await import("./canvas-screen-source-fake");
      return { status: "created", ...fakeCreate(roomId.data, source.data, formFactor.data, name.data) };
    }
    const client = await createClient(new Headers());
    const { data, error } = await client.rpc("create_canvas_screen", {
      target_room_id: roomId.data, screen_name: name.data, new_kind: source.data.kind,
      new_files: source.data.files, new_entry: source.data.entry, new_form_factor: formFactor.data,
    });
    if (error) { fail("create", error.message); return { status: "error" }; }
    const parsed = z.object({ screenId: Id, versionId: Id }).safeParse(data);
    return parsed.success ? { status: "created", ...parsed.data } : { status: "error" };
  } catch (thrown) {
    fail("create", thrown);
    return { status: "error" };
  }
}

export async function saveScreenVersion(input: {
  screenId: string; baseVersionId: string | null; files: Record<string, string>;
  links?: string[]; kind?: ScreenKind; entry?: string;
}): Promise<SaveScreenVersionResult> {
  const screenId = Id.safeParse(input.screenId);
  const base = Id.nullable().safeParse(input.baseVersionId);
  const files = ScreenFilesSchema.safeParse(input.files);
  const links = Links.safeParse(input.links ?? []);
  const kind = z.enum(SCREEN_KINDS).optional().safeParse(input.kind);
  const entry = Entry.optional().safeParse(input.entry);
  if (!screenId.success || !base.success || !files.success || !links.success || !kind.success || !entry.success) return { status: "error" };
  // The RPC re-checks this, but failing here keeps the e2e fake and production identical.
  if (entry.data !== undefined && !Object.hasOwn(files.data, entry.data)) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeSave } = await import("./canvas-screen-source-fake");
      return fakeSave(screenId.data, base.data, files.data, links.data, kind.data, entry.data) ?? { status: "error" };
    }
    const client = await createClient(new Headers());
    const { data, error } = await client.rpc("save_canvas_screen_version", {
      target_screen_id: screenId.data, base_version: base.data, new_files: files.data,
      new_links: links.data, new_kind: kind.data ?? null, new_entry: entry.data ?? null,
    });
    if (error) { fail("save", error.message); return { status: "error" }; }
    const parsed = SavedRow.safeParse(data);
    return parsed.success ? parsed.data : { status: "error" };
  } catch (thrown) {
    fail("save", thrown);
    return { status: "error" };
  }
}

export async function restoreScreenVersion(input: { screenId: string; versionId: string }): Promise<SaveScreenVersionResult> {
  const screenId = Id.safeParse(input.screenId);
  const versionId = Id.safeParse(input.versionId);
  if (!screenId.success || !versionId.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeRestore } = await import("./canvas-screen-source-fake");
      return fakeRestore(screenId.data, versionId.data) ?? { status: "error" };
    }
    const client = await createClient(new Headers());
    const { data, error } = await client.rpc("restore_screen_version", {
      target_screen_id: screenId.data, target_version_id: versionId.data,
    });
    if (error) { fail("restore", error.message); return { status: "error" }; }
    const parsed = SavedRow.safeParse(data);
    return parsed.success ? parsed.data : { status: "error" };
  } catch (thrown) {
    fail("restore", thrown);
    return { status: "error" };
  }
}

export async function listScreenVersions(screenId: string): Promise<{ status: "ok"; versions: ScreenVersionSummary[] } | { status: "error" }> {
  const id = Id.safeParse(screenId);
  if (!id.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeList } = await import("./canvas-screen-source-fake");
      const versions = fakeList(id.data);
      return versions ? { status: "ok", versions } : { status: "error" };
    }
    const client = await createClient(new Headers());
    const { data, error } = await client.from("design_screen_versions")
      .select("id, created_at, source_kind").eq("screen_id", id.data)
      .order("created_at", { ascending: false }).limit(50);
    if (error) { fail("list", error.message); return { status: "error" }; }
    const rows = z.array(z.object({ id: Id, created_at: z.string(), source_kind: z.enum(["legacy", ...SCREEN_KINDS]) })).safeParse(data);
    if (!rows.success) return { status: "error" };
    return { status: "ok", versions: rows.data.map((row) => ({ id: row.id, createdAt: row.created_at, kind: row.source_kind })) };
  } catch (thrown) {
    fail("list", thrown);
    return { status: "error" };
  }
}

export async function readScreenSource(screenId: string): Promise<{ status: "ok"; screen: LoadedScreenSource } | { status: "error" }> {
  const id = Id.safeParse(screenId);
  if (!id.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeRead } = await import("./canvas-screen-source-fake");
      const screen = fakeRead(id.data);
      return screen ? { status: "ok", screen } : { status: "error" };
    }
    const client = await createClient(new Headers());
    const screenRow = await client.from("design_screens")
      .select("id, current_version_id, form_factor").eq("id", id.data).is("deleted_at", null).maybeSingle();
    const screen = z.object({ id: Id, current_version_id: Id, form_factor: FormFactor }).safeParse(screenRow.data);
    if (screenRow.error || !screen.success) return { status: "error" };
    const versionRow = await client.from("design_screen_versions")
      .select("id, source_kind, files, entry, links").eq("id", screen.data.current_version_id).maybeSingle();
    const version = z.object({
      id: Id, source_kind: z.enum(["legacy", ...SCREEN_KINDS]), files: z.unknown(), entry: z.string().nullable(), links: z.array(z.string()),
    }).safeParse(versionRow.data);
    if (versionRow.error || !version.success) return { status: "error" };
    const base = { screenId: screen.data.id, versionId: version.data.id, formFactor: screen.data.form_factor };
    if (version.data.source_kind === "legacy") return { status: "ok", screen: { ...base, legacy: true } };
    const source = ScreenSourceSchema.safeParse({ kind: version.data.source_kind, files: version.data.files, entry: version.data.entry });
    if (!source.success) return { status: "error" };
    return { status: "ok", screen: { ...base, legacy: false, source: source.data, links: version.data.links } };
  } catch (thrown) {
    fail("read", thrown);
    return { status: "error" };
  }
}

export type ConvertBoardScreenResult = {
    status: "created";
    screenId: string;
    versionId: string;
    existing: boolean;
} | {
    status: "error";
};
export async function convertBoardScreen(input: {
    roomId: string;
    boardId: string;
    name: string;
    source: ScreenSource;
    formFactor: "mobile" | "tablet" | "desktop";
    links?: string[];
}): Promise<ConvertBoardScreenResult> {
    const parsed = z.object({ roomId: Id, boardId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
        name: z.string().trim().min(1).max(120), source: ScreenSourceSchema,
        formFactor: FormFactor, links: Links.default([]) }).safeParse(input);
    if (!parsed.success || parsed.data.source.kind !== "html" || parsed.data.source.entry !== "index.html")
        return { status: "error" };
    const value = parsed.data;
    try {
        if (isRoomFakeEnabled()) {
            const { fakeConvert } = await import("./canvas-screen-source-fake");
            return { status: "created", ...fakeConvert(value.roomId, value.boardId, value.source, value.formFactor, value.links) };
        }
        const client = await createClient(new Headers());
        const { data, error } = await client.rpc("convert_canvas_board_screen", {
            target_room_id: value.roomId, board_screen_key: value.boardId, screen_name: value.name,
            new_files: value.source.files, new_entry: value.source.entry, new_form_factor: value.formFactor, new_links: value.links,
        });
        if (error) {
            fail("convert", error.message);
            return { status: "error" };
        }
        const result = z.object({ screenId: Id, versionId: Id, existing: z.boolean() }).safeParse(data);
        return result.success ? { status: "created", ...result.data } : { status: "error" };
    }
    catch (error) {
        fail("convert", error);
        return { status: "error" };
    }
}
export async function readBoardConversion(roomId: string, boardId: string): Promise<{
    status: "ok";
    screenId: string | null;
} | {
    status: "error";
}> {
    if (!Id.safeParse(roomId).success || !z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).safeParse(boardId).success)
        return { status: "error" };
    try {
        if (isRoomFakeEnabled()) {
            const { fakeReadConversion } = await import("./canvas-screen-source-fake");
            return { status: "ok", screenId: fakeReadConversion(roomId, boardId) };
        }
        const client = await createClient(new Headers());
        const { data, error } = await client.rpc("read_canvas_board_conversion", { target_room_id: roomId, board_screen_key: boardId });
        if (error) {
            fail("read conversion", error.message);
            return { status: "error" };
        }
        const result = Id.nullable().safeParse(data);
        return result.success ? { status: "ok", screenId: result.data } : { status: "error" };
    }
    catch (error) {
        fail("read conversion", error);
        return { status: "error" };
    }
}
