import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc, from: mocks.from })),
}));

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
});

import {
  recompileComponentCss,
  recompileComponentCssIfStale,
  resolveComponentBuildRoomId,
  startComponentBuild,
} from "./component-build";

describe("startComponentBuild", () => {
  it("starts a pass for the room", async () => {
    mocks.rpc.mockResolvedValue({ data: "pass-id", error: null });

    await expect(
      startComponentBuild("20000000-0000-4000-8000-000000000001", "codex"),
    ).resolves.toEqual({ status: "started" });
    expect(mocks.rpc).toHaveBeenCalledWith("start_design_component_build", {
      target_room_id: "20000000-0000-4000-8000-000000000001",
      target_provider: "codex",
    });
  });

  it("reports a refusal without leaking the database error", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "no_active_design_system" },
    });

    await expect(
      startComponentBuild("20000000-0000-4000-8000-000000000001", "codex"),
    ).resolves.toEqual({
      status: "error",
      message: "Upload a design system before building its components.",
    });
  });

  it("rejects an id that is not a uuid", async () => {
    await expect(startComponentBuild("nope", "codex")).resolves.toMatchObject({
      status: "error",
    });
  });
});

const VERSION_ID = "30000000-0000-4000-8000-000000000001";
const FRESH_CSS = "/* ds:button */\n.ds-button{font-weight:700}";

// Mirrors the shape a real `.select("profile_json,component_css")` query
// returns: only the selected columns, not the whole row.
function versionRow(componentCss: string | null) {
  return {
    profile_json: {
      colors: [],
      typeScale: [],
      spacing: [],
      radii: [],
      components: [
        {
          name: "button",
          rules: "Primary action.",
          html: '<button class="ds-button">Go</button>',
          css: ".ds-button{font-weight:700}",
        },
      ],
    },
    component_css: componentCss,
  };
}

function fromForVersionSelect(row: unknown, error: unknown = null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: row, error }),
      }),
    }),
  };
}

describe("recompileComponentCss", () => {
  it("reads profile_json and component_css in one query, and writes back the recompiled css", async () => {
    mocks.from.mockReturnValueOnce(fromForVersionSelect(versionRow("stale{}")));
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await recompileComponentCss(VERSION_ID);

    expect(mocks.from).toHaveBeenCalledWith("design_system_profile_versions");
    expect(mocks.rpc).toHaveBeenCalledWith("set_design_component_css", {
      target_version_id: VERSION_ID,
      css: FRESH_CSS,
    });
  });

  it("skips the write when the compiled css already matches what is stored", async () => {
    mocks.from.mockReturnValueOnce(fromForVersionSelect(versionRow(FRESH_CSS)));

    await recompileComponentCss(VERSION_ID);

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does nothing when the version cannot be read", async () => {
    mocks.from.mockReturnValueOnce(
      fromForVersionSelect(null, { message: "not found" }),
    );

    await expect(recompileComponentCss(VERSION_ID)).resolves.toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a uuid without touching the database", async () => {
    await expect(recompileComponentCss("nope")).resolves.toBeUndefined();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("recompileComponentCssIfStale", () => {
  const WORKSPACE_ID = "70000000-0000-4000-8000-000000000001";

  it("resolves the active version and recompiles it in one extra query, without asking about build passes", async () => {
    mocks.from
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { active_version_id: VERSION_ID },
              error: null,
            }),
          }),
        }),
      })
      .mockReturnValueOnce(fromForVersionSelect(versionRow("stale{}")));
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await recompileComponentCssIfStale(WORKSPACE_ID);

    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from).not.toHaveBeenCalledWith("design_component_build_passes");
    expect(mocks.rpc).toHaveBeenCalledWith("set_design_component_css", {
      target_version_id: VERSION_ID,
      css: FRESH_CSS,
    });
  });

  it("does nothing for a workspace with no active design system, in a single query", async () => {
    mocks.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { active_version_id: null },
            error: null,
          }),
        }),
      }),
    });

    await recompileComponentCssIfStale(WORKSPACE_ID);

    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a uuid without touching the database", async () => {
    await expect(recompileComponentCssIfStale("nope")).resolves.toBeUndefined();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("resolveComponentBuildRoomId", () => {
  it("prefers the room from an in-progress or finished build pass", async () => {
    mocks.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({
              data: [{ room_id: "40000000-0000-4000-8000-000000000001" }],
              error: null,
            }),
          }),
        }),
      }),
    });

    await expect(
      resolveComponentBuildRoomId("50000000-0000-4000-8000-000000000001"),
    ).resolves.toBe("40000000-0000-4000-8000-000000000001");
  });

  it("falls back to the distill that produced the active version", async () => {
    mocks.from
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { active_version_id: "30000000-0000-4000-8000-000000000001" },
              error: null,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: [{ room_id: "60000000-0000-4000-8000-000000000001" }],
              error: null,
            }),
          }),
        }),
      });

    await expect(
      resolveComponentBuildRoomId("50000000-0000-4000-8000-000000000001"),
    ).resolves.toBe("60000000-0000-4000-8000-000000000001");
  });

  it("returns null when nothing resolves a room", async () => {
    mocks.from
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { active_version_id: null }, error: null }),
          }),
        }),
      });

    await expect(
      resolveComponentBuildRoomId("50000000-0000-4000-8000-000000000001"),
    ).resolves.toBeNull();
  });

  it("rejects an id that is not a uuid", async () => {
    await expect(resolveComponentBuildRoomId("nope")).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
