import { describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import { getActiveDesignProfile } from "./design-profile-reader";

function supabaseStub(
  activeVersionId: string | null | undefined,
  opts: { errorTable?: string; tokenCss?: string } = {},
) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (opts.errorTable === table) {
              return {
                data: null,
                error: { message: "query error" },
              };
            }
            if (table === "rooms") {
              return {
                data: { workspace_id: "00000000-0000-4000-8000-000000000099" },
                error: null,
              };
            }
            if (table === "design_system_profile_versions") {
              return {
                data: { token_css: opts.tokenCss ?? "" },
                error: null,
              };
            }
            return {
              data: activeVersionId === undefined ? null : { active_version_id: activeVersionId },
              error: null,
            };
          },
        }),
      }),
    }),
  };
}

describe("getActiveDesignProfile", () => {
  it("returns false when the workspace has no profile row", async () => {
    createClientMock.mockResolvedValue(supabaseStub(undefined));
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      hasActiveProfile: false,
      tokenCss: "",
    });
  });

  it("returns false when active_version_id is null", async () => {
    createClientMock.mockResolvedValue(supabaseStub(null));
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      hasActiveProfile: false,
      tokenCss: "",
    });
  });

  it("returns the active version's token CSS when a version is set", async () => {
    createClientMock.mockResolvedValue(
      supabaseStub("00000000-0000-4000-8000-000000000002", {
        tokenCss: ":root{--ds-color-brand:#123456}",
      }),
    );
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      hasActiveProfile: true,
      tokenCss: ":root{--ds-color-brand:#123456}",
    });
  });

  it("returns false for an invalid roomId rather than throwing", async () => {
    expect(await getActiveDesignProfile("not-a-uuid")).toEqual({
      hasActiveProfile: false,
      tokenCss: "",
    });
  });

  it("returns false when a query encounters an error", async () => {
    createClientMock.mockResolvedValue(
      supabaseStub(undefined, { errorTable: "design_system_profiles" }),
    );
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      hasActiveProfile: false,
      tokenCss: "",
    });
  });
});
