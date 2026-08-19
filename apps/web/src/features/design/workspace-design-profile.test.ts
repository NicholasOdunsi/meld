import { describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import { getWorkspaceDesignSystem } from "./workspace-design-profile";

const VALID_PROFILE = {
  colors: [{ name: "brand", value: "rebeccapurple" }],
  typeScale: [],
  spacing: [],
  radii: [],
  components: [],
};

function supabaseStub(
  activeVersionId: string | null | undefined,
  opts: {
    errorTable?: string;
    profileJson?: unknown;
    tokenCss?: string;
    componentCss?: string | null;
  } = {},
) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (opts.errorTable === table) {
              return { data: null, error: { message: "query error" } };
            }
            if (table === "design_system_profile_versions") {
              return {
                data: {
                  profile_json: opts.profileJson ?? VALID_PROFILE,
                  token_css: opts.tokenCss ?? "",
                  component_css: opts.componentCss ?? null,
                },
                error: null,
              };
            }
            return {
              data:
                activeVersionId === undefined
                  ? null
                  : { active_version_id: activeVersionId },
              error: null,
            };
          },
        }),
      }),
    }),
  };
}

describe("getWorkspaceDesignSystem", () => {
  it("returns the parsed profile, tokenCss, and componentCss for an active version", async () => {
    createClientMock.mockResolvedValue(
      supabaseStub("00000000-0000-4000-8000-000000000002", {
        tokenCss: ":root{--ds-color-brand:rebeccapurple}",
        componentCss: ".ds-button{font-weight:600}",
      }),
    );
    expect(
      await getWorkspaceDesignSystem("00000000-0000-4000-8000-000000000001"),
    ).toEqual({
      profile: VALID_PROFILE,
      tokenCss: ":root{--ds-color-brand:rebeccapurple}",
      componentCss: ".ds-button{font-weight:600}",
    });
  });

  it("returns null when the workspace has no profile row", async () => {
    createClientMock.mockResolvedValue(supabaseStub(undefined));
    expect(
      await getWorkspaceDesignSystem("00000000-0000-4000-8000-000000000001"),
    ).toBeNull();
  });

  it("returns null when active_version_id is null", async () => {
    createClientMock.mockResolvedValue(supabaseStub(null));
    expect(
      await getWorkspaceDesignSystem("00000000-0000-4000-8000-000000000001"),
    ).toBeNull();
  });

  it("returns null for an invalid workspaceId rather than throwing", async () => {
    expect(await getWorkspaceDesignSystem("not-a-uuid")).toBeNull();
  });

  it("returns null when the profile_json fails schema validation", async () => {
    createClientMock.mockResolvedValue(
      supabaseStub("00000000-0000-4000-8000-000000000002", {
        profileJson: { colors: "not-an-array" },
      }),
    );
    expect(
      await getWorkspaceDesignSystem("00000000-0000-4000-8000-000000000001"),
    ).toBeNull();
  });

  it("returns null when a query encounters an error", async () => {
    createClientMock.mockResolvedValue(
      supabaseStub(undefined, { errorTable: "design_system_profiles" }),
    );
    expect(
      await getWorkspaceDesignSystem("00000000-0000-4000-8000-000000000001"),
    ).toBeNull();
  });
});
