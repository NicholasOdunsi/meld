import { describe, expect, it, vi } from "vitest";
import { createPastedScreen, type PasteDeps } from "./create-pasted-screen";

const SCREEN = "E5000000-0000-4000-8000-000000000001";
const source = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };
const view = { scrollX: 0, scrollY: 0, zoom: 1, width: 1000, height: 800 };

function deps(result: Awaited<ReturnType<PasteDeps["create"]>>) {
  return {
    roomId: "room", view,
    store: { set: vi.fn(() => true) },
    create: vi.fn(async () => result),
    addFrame: vi.fn(),
    wake: vi.fn(),
  } satisfies PasteDeps;
}

describe("createPastedScreen", () => {
  it("saves the screen, shows its placeholder at the centre at device size, then wakes it", async () => {
    const d = deps({ status: "created", screenId: SCREEN, versionId: "v" });
    await expect(createPastedScreen(d, { name: "Counter", autoName: false, source, formFactor: "mobile" }))
      .resolves.toEqual({ status: "created", screenId: SCREEN, boardScreenId: `ds-${SCREEN.toLowerCase()}` });
    expect(d.create).toHaveBeenCalledWith({ roomId: "room", name: "Counter", source, formFactor: "mobile" });
    expect(d.store.set).toHaveBeenCalledWith({ id: `ds-${SCREEN.toLowerCase()}`, rev: 1, html: expect.stringContaining("Counter") });
    expect(d.addFrame).toHaveBeenCalledWith({ screenId: `ds-${SCREEN.toLowerCase()}`, x: 305, y: -22, width: 390, height: 844 });
    expect(d.wake).toHaveBeenCalledWith(`ds-${SCREEN.toLowerCase()}`, { source, snapshot: true });
  });

  it("adds nothing when saving fails", async () => {
    const d = deps({ status: "error" });
    await expect(createPastedScreen(d, { name: "Counter", autoName: false, source, formFactor: "desktop" })).resolves.toEqual({ status: "error" });
    expect(d.store.set).not.toHaveBeenCalled();
    expect(d.addFrame).not.toHaveBeenCalled();
    expect(d.wake).not.toHaveBeenCalled();
  });
});
