import type { CanvasScreen } from "./canvas-screen-reader";
import type { ScreenKind, ScreenSource } from "@meld/screen-runtime/source";

type FakeVersion = { id: string; kind: ScreenKind; files: Record<string, string>; entry: string; links: string[]; createdAt: string };
type FakeScreen = { name:string; roomId: string; formFactor: "mobile" | "tablet" | "desktop"; current: string; updating: boolean; versions: FakeVersion[] };

// Next dev compiles server actions into separate module graphs; keep the fake
// on the server global so every graph sees the same screens.
const screens: Map<string, FakeScreen> = ((globalThis as typeof globalThis & { __orionFakeCanvasScreens?: Map<string, FakeScreen> })
  .__orionFakeCanvasScreens ??= new Map<string, FakeScreen>());

export function fakeCreate(roomId: string, source: ScreenSource, formFactor: FakeScreen["formFactor"], name = "Screen") {
  const screenId = crypto.randomUUID();
  const version: FakeVersion = { id: crypto.randomUUID(), ...source, links: [], createdAt: new Date().toISOString() };
  screens.set(screenId, { name, roomId, formFactor, current: version.id, updating: false, versions: [version] });
  return { screenId, versionId: version.id };
}

export function fakeSave(screenId: string, base: string | null, files: Record<string, string>, links: string[], kind?: ScreenKind, entry?: string) {
  const screen = screens.get(screenId);
  if (!screen) return null;
  if (screen.updating || screen.current !== base) return { status: "conflict" as const, versionId: screen.current };
  const previous = screen.versions.find((version) => version.id === screen.current)!;
  const nextEntry = entry ?? previous.entry;
  if (!Object.hasOwn(files, nextEntry)) return null;
  const version: FakeVersion = {
    id: crypto.randomUUID(), kind: kind ?? previous.kind, entry: nextEntry,
    files, links, createdAt: new Date().toISOString(),
  };
  screen.versions.push(version);
  screen.current = version.id;
  return { status: "saved" as const, versionId: version.id };
}

export function fakeRestore(screenId: string, versionId: string) {
  const screen = screens.get(screenId);
  const source = screen?.versions.find((version) => version.id === versionId);
  if (!screen || !source) return null;
  return fakeSave(screenId, screen.current, source.files, source.links, source.kind, source.entry);
}

export function fakeRead(screenId: string) {
  const screen = screens.get(screenId);
  const version = screen?.versions.find((candidate) => candidate.id === screen.current);
  if (!screen || !version) return null;
  return {
    screenId, versionId: version.id, formFactor: screen.formFactor, legacy: false as const,
    source: { kind: version.kind, files: version.files, entry: version.entry }, links: version.links,
  };
}

export function fakeList(screenId: string) {
  const screen = screens.get(screenId);
  if (!screen) return null;
  return [...screen.versions].reverse().map((version) => ({ id: version.id, createdAt: version.createdAt, kind: version.kind }));
}

const conversions: Map<string, string> = ((globalThis as typeof globalThis & {
    __orionFakeCanvasConversions?: Map<string, string>;
})
    .__orionFakeCanvasConversions ??= new Map<string, string>());
export function fakeReadConversion(roomId: string, boardId: string) {
    const id = conversions.get(`${roomId}:${boardId}`);
    return id && screens.get(id)?.roomId === roomId ? id : null;
}
export function fakeConvert(roomId: string, boardId: string, source: ScreenSource, formFactor: FakeScreen["formFactor"], links: string[]) {
    const existing = fakeReadConversion(roomId, boardId);
    if (existing)
        return { screenId: existing, versionId: screens.get(existing)!.current, existing: true };
    const created = fakeCreate(roomId, source, formFactor);
    screens.get(created.screenId)!.versions[0].links = [...links];
    conversions.set(`${roomId}:${boardId}`, created.screenId);
    return { ...created, existing: false };
}

/** Internal fake-only inspection; the server action performs authenticated room authorization. */
export function fakeEditTestState(screenId: string) {
  const screen = screens.get(screenId), read = fakeRead(screenId);
  return screen && read ? { roomId: screen.roomId, versionId: read.versionId, versionCount: screen.versions.length, source: read.source } : null;
}

// The real reader sees newly-created design_screens on a later page load.
// Keep that recovery path faithful when browser tests use the in-memory store.
export function fakeCanvasRoomScreens(roomId:string):CanvasScreen[]{
  return [...screens].filter(([,screen])=>screen.roomId===roomId).map(([id,screen])=>({
    id,name:screen.name??"Screen",canvasX:0,canvasY:0,flowNodeId:null,state:"built",preview:null,screenKey:null,
    formFactor:screen.formFactor,sourceKind:screen.versions.find(v=>v.id===screen.current)!.kind,
    layout:null,layoutKey:null,layoutName:null,
  }));
}
