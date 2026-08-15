import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isRoomFakeEnabled: vi.fn(() => false),
  fakeListRoomCanvasScreens: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({
  isRoomFakeEnabled: mocks.isRoomFakeEnabled,
}));
vi.mock("@/features/rooms/e2e-fake", () => ({
  fakeListRoomCanvasScreens: mocks.fakeListRoomCanvasScreens,
}));

import {
  listRoomCanvasScreens,
  readRoomCanvasScreens,
} from "./canvas-screen-reader";

const ROOM_ID = "20000000-0000-4000-8000-000000000002";
const BUILT_SCREEN_ID = "30000000-0000-4000-8000-000000000003";
const EMPTY_SCREEN_ID = "40000000-0000-4000-8000-000000000004";
const VERSION_ID = "50000000-0000-4000-8000-000000000005";

const screenRows = [
  {
    id: BUILT_SCREEN_ID,
    name: "Checkout",
    canvas_x: 120,
    canvas_y: 80,
    flow_node_id: "checkout",
    state: "built",
    current_version_id: VERSION_ID,
    screen_key: null,
  },
  {
    id: EMPTY_SCREEN_ID,
    name: "Confirmation",
    canvas_x: 600,
    canvas_y: 80,
    flow_node_id: null,
    state: "empty",
    current_version_id: null,
    screen_key: null,
  },
];

const versionRows = [
  {
    id: VERSION_ID,
    screen_id: BUILT_SCREEN_ID,
    markup: "<main><h1>Checkout</h1></main>",
    styles: "main { color: var(--ds-color-primary); }",
    script: null,
    actions_json: [],
  },
];

function withRows(
  screens: unknown,
  versions: unknown = [],
  screenError: unknown = null,
  versionError: unknown = null,
) {
  const screenQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
  };
  screenQuery.select.mockReturnValue(screenQuery);
  screenQuery.eq.mockReturnValue(screenQuery);
  screenQuery.is.mockReturnValue(screenQuery);
  screenQuery.order.mockResolvedValue({ data: screens, error: screenError });

  const versionQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
  };
  versionQuery.select.mockReturnValue(versionQuery);
  versionQuery.eq.mockReturnValue(versionQuery);
  versionQuery.in.mockResolvedValue({ data: versions, error: versionError });

  const from = vi.fn((table: string) => {
    if (table === "design_screens") return screenQuery;
    return versionQuery;
  });
  mocks.createClient.mockResolvedValue({ from });

  return { from, screenQuery, versionQuery };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isRoomFakeEnabled.mockReturnValue(false);
});

describe("listRoomCanvasScreens", () => {
  it("distinguishes an authoritative empty result from a failed read", async () => {
    withRows([]);
    await expect(readRoomCanvasScreens(ROOM_ID)).resolves.toEqual({
      ok: true,
      screens: [],
    });

    const queryError = { message: "permission denied" };
    withRows(null, [], queryError);
    await expect(readRoomCanvasScreens(ROOM_ID)).resolves.toEqual({
      ok: false,
      screens: [],
    });

    // The original array-only API remains available to existing callers.
    await expect(listRoomCanvasScreens(ROOM_ID)).resolves.toEqual([]);
  });

  it("maps built and empty screen rows to canvas projections", async () => {
    const { screenQuery, versionQuery } = withRows(screenRows, versionRows);

    await expect(listRoomCanvasScreens(ROOM_ID)).resolves.toEqual([
      {
        id: BUILT_SCREEN_ID,
        name: "Checkout",
        canvasX: 120,
        canvasY: 80,
        flowNodeId: "checkout",
        state: "built",
        screenKey: null,
        preview: {
          markup: versionRows[0].markup,
          styles: versionRows[0].styles,
          script: null,
          actions: [],
        },
      },
      {
        id: EMPTY_SCREEN_ID,
        name: "Confirmation",
        canvasX: 600,
        canvasY: 80,
        flowNodeId: null,
        state: "empty",
        screenKey: null,
        preview: null,
      },
    ]);
    expect(screenQuery.eq).toHaveBeenCalledWith("room_id", ROOM_ID);
    expect(screenQuery.is).toHaveBeenCalledWith("deleted_at", null);
    expect(screenQuery.order).toHaveBeenCalledWith("canvas_x", {
      ascending: true,
    });
    expect(versionQuery.in).toHaveBeenCalledWith("id", [VERSION_ID]);
    expect(versionQuery.eq).toHaveBeenCalledWith("room_id", ROOM_ID);
  });

  it("returns empty without a version query when screens have no current version", async () => {
    const { versionQuery } = withRows(screenRows.slice(1));

    await expect(listRoomCanvasScreens(ROOM_ID)).resolves.toEqual([
      {
        id: EMPTY_SCREEN_ID,
        name: "Confirmation",
        canvasX: 600,
        canvasY: 80,
        flowNodeId: null,
        state: "empty",
        screenKey: null,
        preview: null,
      },
    ]);
    expect(versionQuery.in).not.toHaveBeenCalled();
  });

  it("does not attach a current version that belongs to another screen", async () => {
    withRows(screenRows, [
      {
        ...versionRows[0],
        screen_id: EMPTY_SCREEN_ID,
      },
    ]);

    const result = await listRoomCanvasScreens(ROOM_ID);

    expect(result[0]).toMatchObject({
      id: BUILT_SCREEN_ID,
      preview: null,
    });
  });

  it("uses the participant-scoped fake seam without opening Supabase", async () => {
    const fakeScreens = [
      {
        id: BUILT_SCREEN_ID,
        name: "Checkout",
        canvasX: 0,
        canvasY: 0,
        flowNodeId: null,
        state: "built" as const,
        preview: {
          markup: versionRows[0].markup,
          styles: versionRows[0].styles,
          script: null,
          actions: [],
        },
      },
    ];
    mocks.isRoomFakeEnabled.mockReturnValue(true);
    mocks.fakeListRoomCanvasScreens.mockResolvedValue(fakeScreens);

    await expect(listRoomCanvasScreens(ROOM_ID)).resolves.toEqual(fakeScreens);
    expect(mocks.fakeListRoomCanvasScreens).toHaveBeenCalledWith(ROOM_ID);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("logs and returns an empty list when the screen query fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const queryError = { message: "permission denied" };
    withRows(null, [], queryError);

    await expect(listRoomCanvasScreens(ROOM_ID)).resolves.toEqual([]);
    expect(error).toHaveBeenCalledWith("canvas screens read failed", queryError);
  });

  it("logs and returns an empty list when the version query fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const queryError = { message: "permission denied" };
    withRows(screenRows, null, null, queryError);

    await expect(listRoomCanvasScreens(ROOM_ID)).resolves.toEqual([]);
    expect(error).toHaveBeenCalledWith(
      "canvas screen versions read failed",
      queryError,
    );
  });

  it("strictly rejects malformed rows and invalid room ids", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    withRows([{ ...screenRows[0], unexpected: true }], versionRows);

    await expect(listRoomCanvasScreens(ROOM_ID)).resolves.toEqual([]);
    await expect(listRoomCanvasScreens("not-a-uuid")).resolves.toEqual([]);
    expect(error).toHaveBeenCalledWith(
      "canvas screens response invalid",
      expect.anything(),
    );
  });
});

describe("listRoomCanvasScreens action target resolution", () => {
  const SCREEN_A_ID = "a0000000-0000-4000-8000-00000000000a";
  const SCREEN_B_ID = "b0000000-0000-4000-8000-00000000000b";
  const VERSION_A_ID = "a1000000-0000-4000-8000-00000000000a";

  function screenARow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: SCREEN_A_ID,
      name: "A",
      canvas_x: 0,
      canvas_y: 0,
      flow_node_id: null,
      state: "built" as const,
      current_version_id: VERSION_A_ID,
      screen_key: null,
      ...overrides,
    };
  }

  function versionARow(actions: unknown[]) {
    return {
      id: VERSION_A_ID,
      screen_id: SCREEN_A_ID,
      markup: '<button data-meld-action="go">Go</button>',
      styles: "",
      script: null,
      actions_json: actions,
    };
  }

  // A screen keyed "projects" is still a legal navigation target while it's
  // empty -- the canvas overlay resolves the whole live room, built or not.
  const screenBEmptyKeyed = {
    id: SCREEN_B_ID,
    name: "B",
    canvas_x: 100,
    canvas_y: 0,
    flow_node_id: null,
    state: "empty" as const,
    current_version_id: null,
    screen_key: "projects",
  };

  it("resolves a targetScreenKey to its screen even when that screen is still empty", async () => {
    withRows(
      [screenARow(), screenBEmptyKeyed],
      [versionARow([{ id: "go", label: "Go", targetScreenKey: "projects" }])],
    );

    const result = await listRoomCanvasScreens(ROOM_ID);

    expect(result[0].preview?.actions).toEqual([
      { id: "go", label: "Go", targetScreenId: SCREEN_B_ID },
    ]);
  });

  it("resolves the same key target when B is ordered before A (reverse build order)", async () => {
    withRows(
      [{ ...screenBEmptyKeyed, canvas_x: 0 }, screenARow({ canvas_x: 100 })],
      [versionARow([{ id: "go", label: "Go", targetScreenKey: "projects" }])],
    );

    const result = await listRoomCanvasScreens(ROOM_ID);

    const screenA = result.find((screen) => screen.id === SCREEN_A_ID);
    expect(screenA?.preview?.actions).toEqual([
      { id: "go", label: "Go", targetScreenId: SCREEN_B_ID },
    ]);
  });

  it("still resolves a legacy action carrying only targetScreenId", async () => {
    withRows(
      [screenARow(), screenBEmptyKeyed],
      [versionARow([{ id: "go", label: "Go", targetScreenId: SCREEN_B_ID }])],
    );

    const result = await listRoomCanvasScreens(ROOM_ID);

    expect(result[0].preview?.actions).toEqual([
      { id: "go", label: "Go", targetScreenId: SCREEN_B_ID },
    ]);
  });

  it("resolves to null when the targeted key has no owning screen", async () => {
    withRows(
      [screenARow()],
      [versionARow([{ id: "go", label: "Go", targetScreenKey: "missing" }])],
    );

    const result = await listRoomCanvasScreens(ROOM_ID);

    expect(result[0].preview?.actions).toEqual([
      { id: "go", label: "Go", targetScreenId: null },
    ]);
  });
});
