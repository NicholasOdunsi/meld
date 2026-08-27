import { describe, expect, it } from "vitest";
import { parseRoomTabRow, nextTabPosition } from "./room-tabs-repository";

describe("parseRoomTabRow", () => {
  it("reads a well-formed row", () => {
    expect(
      parseRoomTabRow({
        id: "tab-1",
        name: "Checkout",
        position: 2,
        panes: ["canvas", "prd"],
      }),
    ).toEqual({ id: "tab-1", name: "Checkout", position: 2, panes: ["canvas", "prd"] });
  });

  it("keeps an untitled tab untitled", () => {
    const tab = parseRoomTabRow({ id: "t", name: null, position: 0, panes: [] });
    expect(tab.name).toBeNull();
  });

  // The column is jsonb. A row written by an older client, or by hand, must
  // not be able to crash the Room -- an unreadable layout renders as empty.
  it("drops panes that are not known tools", () => {
    const tab = parseRoomTabRow({
      id: "t",
      name: null,
      position: 0,
      panes: ["canvas", "wat", 7, null],
    });
    expect(tab.panes).toEqual(["canvas"]);
  });

  it("drops duplicate panes", () => {
    const tab = parseRoomTabRow({
      id: "t",
      name: null,
      position: 0,
      panes: ["prd", "prd", "canvas"],
    });
    expect(tab.panes).toEqual(["prd", "canvas"]);
  });

  it("clamps to four panes", () => {
    const tab = parseRoomTabRow({
      id: "t",
      name: null,
      position: 0,
      panes: ["canvas", "prototype", "prd", "canvas", "prototype"],
    });
    expect(tab.panes).toHaveLength(3);
  });

  it("treats a non-array layout as empty", () => {
    expect(parseRoomTabRow({ id: "t", name: null, position: 0, panes: null }).panes)
      .toEqual([]);
  });
});

describe("nextTabPosition", () => {
  it("starts at zero for a room with no tabs", () => {
    expect(nextTabPosition([])).toBe(0);
  });

  it("reuses the first free fallback-name slot", () => {
    expect(nextTabPosition([{ position: 0 }, { position: 2 }])).toBe(1);
  });
});
