import { describe, expect, it } from "vitest";
import type { PaneLayout } from "./pane-layout";
import { createFakeRoomBackend } from "./fake-backend";

// The fake has no CHECK constraint behind it, so these three bad shapes --
// over the four-pane cap, an unknown tool, a repeated tool -- must be
// refused by hand. A caller that builds an invalid PaneLayout should fail the
// same way against the fake as it would against Postgres's
// room_tabs_panes_shape constraint, not succeed silently.
describe("fake room tabs: pane-shape validation", () => {
  it("rejects more than four panes on createRoomTab", async () => {
    const backend = createFakeRoomBackend();
    await expect(
      backend.createRoomTab({
        roomId: "room-cap-create",
        panes: [
          "canvas",
          "prototype",
          "prd",
          "canvas",
          "prototype",
        ] as unknown as PaneLayout,
      }),
    ).rejects.toThrow("We could not create a new tab.");
  });

  it("rejects an unknown tool on createRoomTab", async () => {
    const backend = createFakeRoomBackend();
    await expect(
      backend.createRoomTab({
        roomId: "room-unknown-create",
        panes: ["canvas", "wat"] as unknown as PaneLayout,
      }),
    ).rejects.toThrow("We could not create a new tab.");
  });

  it("rejects a duplicate tool on createRoomTab", async () => {
    const backend = createFakeRoomBackend();
    await expect(
      backend.createRoomTab({
        roomId: "room-dup-create",
        panes: ["canvas", "canvas"] as unknown as PaneLayout,
      }),
    ).rejects.toThrow("We could not create a new tab.");
  });

  it("rejects more than four panes on setRoomTabPanes", async () => {
    const backend = createFakeRoomBackend();
    const [tab] = await backend.listRoomTabs("room-cap-set");
    await expect(
      backend.setRoomTabPanes({
        tabId: tab!.id,
        panes: [
          "canvas",
          "prototype",
          "prd",
          "canvas",
          "prototype",
        ] as unknown as PaneLayout,
      }),
    ).rejects.toThrow("We could not update this tab's layout.");
  });

  it("rejects an unknown tool on setRoomTabPanes", async () => {
    const backend = createFakeRoomBackend();
    const [tab] = await backend.listRoomTabs("room-unknown-set");
    await expect(
      backend.setRoomTabPanes({
        tabId: tab!.id,
        panes: ["canvas", "wat"] as unknown as PaneLayout,
      }),
    ).rejects.toThrow("We could not update this tab's layout.");
  });

  it("rejects a duplicate tool on setRoomTabPanes", async () => {
    const backend = createFakeRoomBackend();
    const [tab] = await backend.listRoomTabs("room-dup-set");
    await expect(
      backend.setRoomTabPanes({
        tabId: tab!.id,
        panes: ["prd", "prd"] as unknown as PaneLayout,
      }),
    ).rejects.toThrow("We could not update this tab's layout.");
  });

  it("leaves an existing tab's panes untouched after a rejected write", async () => {
    const backend = createFakeRoomBackend();
    const [tab] = await backend.listRoomTabs("room-unchanged");
    await expect(
      backend.setRoomTabPanes({
        tabId: tab!.id,
        panes: ["wat"] as unknown as PaneLayout,
      }),
    ).rejects.toThrow();
    const [after] = await backend.listRoomTabs("room-unchanged");
    expect(after!.panes).toEqual([]);
  });

  it("still accepts a valid layout on both methods", async () => {
    const backend = createFakeRoomBackend();
    const created = await backend.createRoomTab({
      roomId: "room-valid",
      panes: ["canvas", "prd"],
    });
    expect(created.panes).toEqual(["canvas", "prd"]);

    await backend.setRoomTabPanes({
      tabId: created.id,
      panes: ["prototype"],
    });
    const [, updated] = await backend.listRoomTabs("room-valid");
    expect(updated!.panes).toEqual(["prototype"]);
  });
});

describe("fake room tabs: work-tab limit", () => {
  it("rejects a sixth work tab without changing the existing five", async () => {
    const backend = createFakeRoomBackend();
    const roomId = "room-work-tab-cap";

    await backend.listRoomTabs(roomId);
    for (let index = 1; index < 5; index += 1) {
      await backend.createRoomTab({ roomId });
    }

    await expect(backend.createRoomTab({ roomId })).rejects.toThrow(
      "We could not create a new tab.",
    );
    await expect(backend.listRoomTabs(roomId)).resolves.toHaveLength(5);
  });
});
