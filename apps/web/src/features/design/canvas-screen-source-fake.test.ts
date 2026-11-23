import { describe, expect, it } from "vitest";
import { fakeCanvasRoomScreens, fakeCreate, fakeConvert, fakeReadConversion, fakeList, fakeRead, fakeSave } from "./canvas-screen-source-fake";

const ROOM = "e4000000-0000-4000-8000-000000000001";
const source = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };

describe("canvas screen source fake", () => {
  it("saves when the entry stays among the files", () => {
    const { screenId, versionId } = fakeCreate(ROOM, source, "mobile");
    expect(fakeSave(screenId, versionId, { "App.tsx": "export default () => <p/>" }, [])).toMatchObject({ status: "saved" });
  });
  it("rejects files that drop the current entry, like the database does", () => {
    const { screenId, versionId } = fakeCreate(ROOM, source, "mobile");
    expect(fakeSave(screenId, versionId, { "Other.tsx": "x" }, [])).toBeNull();
    expect(fakeRead(screenId)?.versionId).toBe(versionId);
  });
  it("rejects an explicit entry that is not among the files", () => {
    const { screenId, versionId } = fakeCreate(ROOM, source, "mobile");
    expect(fakeSave(screenId, versionId, source.files, [], "react", "Main.tsx")).toBeNull();
  });
});

// The fake store is server-global across Next module graphs. Mutate only this
// test fixture; do not expose a generation-state server action for tests.
function screenFixture(id: string) {
  const store = (globalThis as typeof globalThis & {
    __orionFakeCanvasScreens?: Map<string, { updating: boolean }>;
  }).__orionFakeCanvasScreens;
  const screen = store?.get(id);
  if (!screen) throw new Error("Missing screen fixture");
  return screen;
}

it("does not save or clear the generation flag while busy, even with the current base", () => {
  const { screenId, versionId } = fakeCreate(ROOM, source, "mobile");
  const before = fakeRead(screenId);
  screenFixture(screenId).updating = true;
  expect(fakeSave(screenId, versionId, { "App.tsx": "new draft" }, []))
    .toEqual({ status: "conflict", versionId });
  expect(fakeRead(screenId)).toEqual(before);
  expect(fakeList(screenId)).toHaveLength(1);
  expect(screenFixture(screenId).updating).toBe(true);
  screenFixture(screenId).updating = false;
  expect(fakeSave(screenId, versionId, { "App.tsx": "new draft" }, []))
    .toMatchObject({ status: "saved" });
  expect(fakeList(screenId)).toHaveLength(2);
  expect(fakeSave(screenId, versionId, source.files, []))
    .toMatchObject({ status: "conflict" });
});

it("converts each room and source key once and returns its latest head", () => {
    const key = crypto.randomUUID();
    const html = { kind: "html" as const, entry: "index.html", files: { "index.html": "first" } };
    const first = fakeConvert(ROOM, key, html, "mobile", ["next"]);
    expect(first.existing).toBe(false);
    const again = fakeConvert(ROOM, key, { ...html, files: { "index.html": "second" } }, "mobile", []);
    expect(again).toEqual({ ...first, existing: true });
    expect(fakeList(first.screenId)).toHaveLength(1);
    expect(fakeRead(first.screenId)?.links).toEqual(["next"]);
    const saved = fakeSave(first.screenId, first.versionId, { "index.html": "saved" }, [])!;
    expect(fakeConvert(ROOM, key, html, "mobile", []).versionId).toBe(saved.versionId);
    expect(fakeConvert("another-room", key, html, "mobile", []).screenId).not.toBe(first.screenId);
    expect(fakeReadConversion(ROOM, key)).toBe(first.screenId);
    expect(fakeReadConversion(ROOM, "missing")).toBeNull();
});

it("lists authored screens for room backfill after a page reload",()=>{
 const {screenId}=fakeCreate(ROOM,source,"mobile","Saved draft");
 expect(fakeCanvasRoomScreens(ROOM)).toContainEqual(expect.objectContaining({id:screenId,name:"Saved draft",sourceKind:"react",state:"built"}));
 expect(fakeCanvasRoomScreens("other-room").some(screen=>screen.id===screenId)).toBe(false);
});
