import { describe, expect, it } from "vitest";
import { fakeCreate, fakeRead, fakeSave } from "./canvas-screen-source-fake";

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
