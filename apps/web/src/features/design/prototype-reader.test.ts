import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isRoomFakeEnabled: vi.fn(() => false),
  fakeListRoomPrototypeScreens: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({
  isRoomFakeEnabled: mocks.isRoomFakeEnabled,
}));
vi.mock("@/features/rooms/e2e-fake", () => ({
  fakeListRoomPrototypeScreens: mocks.fakeListRoomPrototypeScreens,
}));

import { getRoomPrototype } from "./prototype-reader";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const ROOM_ID = "20000000-0000-4000-8000-000000000002";
const FIRST_SCREEN_ID = "30000000-0000-4000-8000-000000000003";
const SECOND_SCREEN_ID = "40000000-0000-4000-8000-000000000004";
const FIRST_VERSION_ID = "50000000-0000-4000-8000-000000000005";
const SECOND_VERSION_ID = "60000000-0000-4000-8000-000000000006";

const screens = [
  {
    id: FIRST_SCREEN_ID,
    name: "Start",
    current_version_id: FIRST_VERSION_ID,
    flow_node_id: null,
    canvas_x: 0,
  },
  {
    id: SECOND_SCREEN_ID,
    name: "Done",
    current_version_id: SECOND_VERSION_ID,
    flow_node_id: "end",
    canvas_x: 100,
  },
];

const versions = [
  {
    id: FIRST_VERSION_ID,
    screen_id: FIRST_SCREEN_ID,
    markup: '<button data-meld-action="continue">Continue</button>',
    styles: "button { color: var(--ds-color-primary); }",
    script: null,
    actions_json: [
      {
        id: "continue",
        label: "Continue",
        targetScreenId: SECOND_SCREEN_ID,
      },
    ],
  },
  {
    id: SECOND_VERSION_ID,
    screen_id: SECOND_SCREEN_ID,
    markup: "<h1>Done</h1>",
    styles: "h1 { color: var(--ds-color-success); }",
    script: null,
    actions_json: [],
  },
];

function withRows(
  screenRows: unknown,
  versionRows: unknown = [],
  screenError: unknown = null,
  versionError: unknown = null,
  profileRow: unknown = null,
  profileVersionRow: unknown = null,
  linkRows: unknown = [],
  linkError: unknown = null,
) {
  const screenQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
  };
  screenQuery.select.mockReturnValue(screenQuery);
  screenQuery.eq.mockReturnValue(screenQuery);
  screenQuery.is.mockReturnValue(screenQuery);
  screenQuery.not.mockReturnValue(screenQuery);
  screenQuery.order.mockResolvedValue({ data: screenRows, error: screenError });

  const versionQuery = {
    select: vi.fn(),
    in: vi.fn(),
  };
  versionQuery.select.mockReturnValue(versionQuery);
  versionQuery.in.mockResolvedValue({ data: versionRows, error: versionError });

  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);
  profileQuery.maybeSingle.mockResolvedValue({ data: profileRow, error: null });

  const profileVersionQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  profileVersionQuery.select.mockReturnValue(profileVersionQuery);
  profileVersionQuery.eq.mockReturnValue(profileVersionQuery);
  profileVersionQuery.maybeSingle.mockResolvedValue({
    data: profileVersionRow,
    error: null,
  });

  const linkQuery = {
    select: vi.fn(),
    in: vi.fn(),
  };
  linkQuery.select.mockReturnValue(linkQuery);
  linkQuery.in.mockResolvedValue({ data: linkRows, error: linkError });

  const from = vi.fn((table: string) => {
    if (table === "design_screens") return screenQuery;
    if (table === "design_screen_versions") return versionQuery;
    if (table === "design_system_profiles") return profileQuery;
    if (table === "design_screen_action_links") return linkQuery;
    return profileVersionQuery;
  });
  mocks.createClient.mockResolvedValue({ from });

  return {
    from,
    screenQuery,
    versionQuery,
    profileQuery,
    profileVersionQuery,
    linkQuery,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isRoomFakeEnabled.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getRoomPrototype", () => {
  it("assembles participant-scoped fake screens without opening Supabase", async () => {
    mocks.isRoomFakeEnabled.mockReturnValue(true);
    mocks.fakeListRoomPrototypeScreens.mockResolvedValue([
      {
        id: FIRST_SCREEN_ID,
        name: "Start",
        markup: versions[0].markup,
        styles: versions[0].styles,
        script: null,
        actions: versions[0].actions_json,
      },
      {
        id: SECOND_SCREEN_ID,
        name: "Done",
        markup: versions[1].markup,
        styles: versions[1].styles,
        script: null,
        actions: versions[1].actions_json,
      },
    ]);

    const result = await getRoomPrototype(WORKSPACE_ID, ROOM_ID);

    expect(result?.screenCount).toBe(2);
    expect(result?.html).toContain(versions[0].markup);
    expect(result?.html).toContain(versions[1].markup);
    expect(mocks.fakeListRoomPrototypeScreens).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      roomId: ROOM_ID,
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("assembles current built screen versions under the room query", async () => {
    const { screenQuery, versionQuery } = withRows(screens, versions);

    const result = await getRoomPrototype(WORKSPACE_ID, ROOM_ID);

    expect(result?.screenCount).toBe(2);
    expect(result?.html).toContain(versions[0].markup);
    expect(result?.html).toContain(versions[1].markup);
    expect(screenQuery.eq).toHaveBeenCalledWith("workspace_id", WORKSPACE_ID);
    expect(screenQuery.eq).toHaveBeenCalledWith("room_id", ROOM_ID);
    expect(screenQuery.eq).toHaveBeenCalledWith("state", "built");
    expect(screenQuery.is).toHaveBeenCalledWith("deleted_at", null);
    expect(screenQuery.not).toHaveBeenCalledWith(
      "current_version_id",
      "is",
      null,
    );
    expect(versionQuery.in).toHaveBeenCalledWith("id", [
      FIRST_VERSION_ID,
      SECOND_VERSION_ID,
    ]);
  });

  it("uses the screen id as a stable start-screen tie breaker", async () => {
    const tiedScreens = [
      { ...screens[1], canvas_x: 0 },
      { ...screens[0], canvas_x: 0 },
    ];
    withRows(tiedScreens, versions);

    const result = await getRoomPrototype(WORKSPACE_ID, ROOM_ID);

    expect(result?.html).toContain(`data-meld-start="${FIRST_SCREEN_ID}"`);
  });

  it("returns null without reading versions when there are no built screens", async () => {
    const { versionQuery } = withRows([]);

    await expect(
      getRoomPrototype(WORKSPACE_ID, ROOM_ID),
    ).resolves.toBeNull();
    expect(versionQuery.in).not.toHaveBeenCalled();
  });

  it("skips a screen whose current version is missing", async () => {
    withRows(screens, [versions[0]]);

    const result = await getRoomPrototype(WORKSPACE_ID, ROOM_ID);

    expect(result?.screenCount).toBe(1);
    expect(result?.html).toContain(versions[0].markup);
    expect(result?.html).not.toContain(versions[1].markup);
  });

  it("logs and returns null when the screen query fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const queryError = { message: "permission internals" };
    withRows(null, [], queryError);

    await expect(
      getRoomPrototype(WORKSPACE_ID, ROOM_ID),
    ).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      "prototype screens read failed",
      queryError,
    );
  });

  it("rejects rows with columns outside the selected strict shape", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    withRows([{ ...screens[0], state: "built" }]);

    await expect(
      getRoomPrototype(WORKSPACE_ID, ROOM_ID),
    ).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      "prototype screens response invalid",
      expect.anything(),
    );
  });

  it("logs and returns null when a version fails the safety gate", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    withRows(screens.slice(0, 1), [
      { ...versions[0], markup: "<iframe></iframe>" },
    ]);

    await expect(
      getRoomPrototype(WORKSPACE_ID, ROOM_ID),
    ).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      "getRoomPrototype failed",
      expect.any(Error),
    );
  });

  it("threads the workspace's active design profile token css into the assembled html", async () => {
    const PROFILE_VERSION_ID = "70000000-0000-4000-8000-000000000007";
    const { profileQuery, profileVersionQuery } = withRows(
      screens,
      versions,
      null,
      null,
      { active_version_id: PROFILE_VERSION_ID },
      { token_css: ":root{--ds-color-primary:#2f6feb}" },
    );

    const result = await getRoomPrototype(WORKSPACE_ID, ROOM_ID);

    expect(result?.html).toContain("--ds-color-primary");
    expect(profileQuery.eq).toHaveBeenCalledWith("workspace_id", WORKSPACE_ID);
    expect(profileVersionQuery.eq).toHaveBeenCalledWith(
      "id",
      PROFILE_VERSION_ID,
    );
  });

  it("assembles successfully with empty token css when no active profile exists", async () => {
    const { profileVersionQuery } = withRows(
      screens,
      versions,
      null,
      null,
      null,
      null,
    );

    const result = await getRoomPrototype(WORKSPACE_ID, ROOM_ID);

    expect(result?.screenCount).toBe(2);
    expect(result?.html).not.toContain(":root{--ds-color-primary:#2f6feb}");
    expect(profileVersionQuery.maybeSingle).not.toHaveBeenCalled();
  });
});

describe("getRoomPrototype action target resolution", () => {
  const SCREEN_A_ID = "a0000000-0000-4000-8000-00000000000a";
  const SCREEN_B_ID = "b0000000-0000-4000-8000-00000000000b";
  const SCREEN_C_ID = "c0000000-0000-4000-8000-00000000000c";
  const GHOST_SCREEN_ID = "d0000000-0000-4000-8000-00000000000d";
  const VERSION_A_ID = "a1000000-0000-4000-8000-00000000000a";
  const VERSION_B_ID = "b1000000-0000-4000-8000-00000000000b";
  const VERSION_C_ID = "c1000000-0000-4000-8000-00000000000c";

  const screenA = {
    id: SCREEN_A_ID,
    name: "A",
    current_version_id: VERSION_A_ID,
    flow_node_id: null,
    canvas_x: 0,
  };
  const screenB = {
    id: SCREEN_B_ID,
    name: "B",
    current_version_id: VERSION_B_ID,
    flow_node_id: "step-b",
    canvas_x: 100,
  };
  const screenC = {
    id: SCREEN_C_ID,
    name: "C",
    current_version_id: VERSION_C_ID,
    flow_node_id: "step-c",
    canvas_x: 200,
  };
  const versionB = {
    id: VERSION_B_ID,
    screen_id: SCREEN_B_ID,
    markup: "<h1>B</h1>",
    styles: "",
    script: null,
    actions_json: [],
  };
  const versionC = {
    id: VERSION_C_ID,
    screen_id: SCREEN_C_ID,
    markup: "<h1>C</h1>",
    styles: "",
    script: null,
    actions_json: [],
  };

  function versionA(actions: unknown[]) {
    return {
      id: VERSION_A_ID,
      screen_id: SCREEN_A_ID,
      markup: '<button data-meld-action="go">Go</button>',
      styles: "",
      script: null,
      actions_json: actions,
    };
  }

  it("resolves a targetNodeId to the flow node's screen", async () => {
    withRows(
      [screenA, screenB],
      [versionA([{ id: "go", label: "Go", targetNodeId: "step-b" }]), versionB],
    );

    const result = await getRoomPrototype(WORKSPACE_ID, ROOM_ID);

    expect(result?.html).toContain(`"go":"${SCREEN_B_ID}"`);
  });

  it("lets a manual override win over the node tag", async () => {
    const { linkQuery } = withRows(
      [screenA, screenB, screenC],
      [
        versionA([{ id: "go", label: "Go", targetNodeId: "step-b" }]),
        versionB,
        versionC,
      ],
      null,
      null,
      null,
      null,
      [{ screen_id: SCREEN_A_ID, action_id: "go", target_screen_id: SCREEN_C_ID }],
    );

    const result = await getRoomPrototype(WORKSPACE_ID, ROOM_ID);

    expect(result?.html).toContain(`"go":"${SCREEN_C_ID}"`);
    expect(linkQuery.in).toHaveBeenCalledWith("screen_id", [
      SCREEN_A_ID,
      SCREEN_B_ID,
      SCREEN_C_ID,
    ]);
  });

  it("still resolves a legacy action carrying only targetScreenId", async () => {
    withRows(
      [screenA, screenB],
      [versionA([{ id: "go", label: "Go", targetScreenId: SCREEN_B_ID }]), versionB],
    );

    const result = await getRoomPrototype(WORKSPACE_ID, ROOM_ID);

    expect(result?.html).toContain(`"go":"${SCREEN_B_ID}"`);
  });

  it("resolves to null when an override targets a soft-deleted/absent screen", async () => {
    withRows(
      [screenA, screenB],
      [versionA([{ id: "go", label: "Go" }]), versionB],
      null,
      null,
      null,
      null,
      [
        {
          screen_id: SCREEN_A_ID,
          action_id: "go",
          target_screen_id: GHOST_SCREEN_ID,
        },
      ],
    );

    const result = await getRoomPrototype(WORKSPACE_ID, ROOM_ID);

    expect(result?.html).toContain(`"go":null`);
    expect(result?.html).not.toContain(GHOST_SCREEN_ID);
  });
});
