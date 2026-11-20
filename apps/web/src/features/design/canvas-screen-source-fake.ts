import type { ScreenKind, ScreenSource } from "@meld/screen-runtime/source";

type FakeVersion = { id: string; kind: ScreenKind; files: Record<string, string>; entry: string; links: string[]; createdAt: string };
type FakeScreen = { roomId: string; formFactor: "mobile" | "tablet" | "desktop"; current: string; updating: boolean; versions: FakeVersion[] };

// Next dev compiles server actions into separate module graphs; keep the fake
// on the server global so every graph sees the same screens.
const screens: Map<string, FakeScreen> = ((globalThis as typeof globalThis & { __orionFakeCanvasScreens?: Map<string, FakeScreen> })
  .__orionFakeCanvasScreens ??= new Map<string, FakeScreen>());

export function fakeCreate(roomId: string, source: ScreenSource, formFactor: FakeScreen["formFactor"]) {
  const screenId = crypto.randomUUID();
  const version: FakeVersion = { id: crypto.randomUUID(), ...source, links: [], createdAt: new Date().toISOString() };
  screens.set(screenId, { roomId, formFactor, current: version.id, updating: false, versions: [version] });
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
