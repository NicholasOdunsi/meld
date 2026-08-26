import { describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import { getActiveDesignProfile } from "./design-profile-reader";

function supabaseStub(
  activeVersionId: string | null | undefined,
  opts: { errorTable?: string; tokenCss?: string; componentCss?: string } = {},
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
                data: {
                  token_css: opts.tokenCss ?? "",
                  component_css: opts.componentCss ?? "",
                },
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
  it("reports a checked negative when the workspace has no profile row", async () => {
    createClientMock.mockResolvedValue(supabaseStub(undefined));
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      status: "ok",
      hasActiveProfile: false,
      tokenCss: "",
      componentCss: "",
    });
  });

  it("reports a checked negative when active_version_id is null", async () => {
    createClientMock.mockResolvedValue(supabaseStub(null));
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      status: "ok",
      hasActiveProfile: false,
      tokenCss: "",
      componentCss: "",
    });
  });

  it("returns the active version's token CSS when a version is set", async () => {
    createClientMock.mockResolvedValue(
      supabaseStub("00000000-0000-4000-8000-000000000002", {
        tokenCss: ":root{--ds-color-brand:rebeccapurple}",
      }),
    );
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      status: "ok",
      hasActiveProfile: true,
      tokenCss: ":root{--ds-color-brand:rebeccapurple}",
      componentCss: "",
    });
  });

  it("returns the active version's component CSS when a version is set", async () => {
    createClientMock.mockResolvedValue(
      supabaseStub("00000000-0000-4000-8000-000000000002", {
        tokenCss: ":root{--ds-color-brand:rebeccapurple}",
        componentCss: ".ds-button{font-weight:600}",
      }),
    );
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      status: "ok",
      hasActiveProfile: true,
      tokenCss: ":root{--ds-color-brand:rebeccapurple}",
      componentCss: ".ds-button{font-weight:600}",
    });
  });

  // The whole point of `status`. A failure must never be reported as "this
  // workspace has no design system" -- that is what told the room to show
  // "No design system yet" over a design system that was already uploaded.
  it("reports unavailable for an invalid roomId rather than a negative", async () => {
    expect(await getActiveDesignProfile("not-a-uuid")).toEqual({
      status: "unavailable",
      hasActiveProfile: false,
      tokenCss: "",
      componentCss: "",
    });
  });

  it("reports unavailable when a query errors, not a negative", async () => {
    createClientMock.mockResolvedValue(
      supabaseStub(undefined, { errorTable: "design_system_profiles" }),
    );
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      status: "unavailable",
      hasActiveProfile: false,
      tokenCss: "",
      componentCss: "",
    });
  });

  it("reports unavailable when the rooms lookup errors", async () => {
    createClientMock.mockResolvedValue(supabaseStub(undefined, { errorTable: "rooms" }));
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      status: "unavailable",
      hasActiveProfile: false,
      tokenCss: "",
      componentCss: "",
    });
  });

  // A profile exists but its CSS is unreadable. Reporting `hasActiveProfile:
  // true` with empty CSS here is what rendered a screen card as a flat,
  // token-less wireframe.
  it("reports unavailable when the version CSS cannot be read", async () => {
    createClientMock.mockResolvedValue(
      supabaseStub("00000000-0000-4000-8000-000000000002", {
        errorTable: "design_system_profile_versions",
      }),
    );
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      status: "unavailable",
      hasActiveProfile: false,
      tokenCss: "",
      componentCss: "",
    });
  });
});
