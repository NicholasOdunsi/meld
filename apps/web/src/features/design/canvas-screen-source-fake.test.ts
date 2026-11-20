import { describe, expect, it } from "vitest";
import { fakeCreate, fakeList, fakeRead, fakeSave } from "./canvas-screen-source-fake";

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
