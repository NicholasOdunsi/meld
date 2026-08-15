import { describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import { getActiveDesignProfile } from "./design-profile-reader";

function supabaseStub(activeVersionId: string | null | undefined, errorTable?: string) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (errorTable === table) {
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
    });
  });

  it("returns false when active_version_id is null", async () => {
    createClientMock.mockResolvedValue(supabaseStub(null));
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      hasActiveProfile: false,
    });
  });

  it("returns true when an active version is set", async () => {
    createClientMock.mockResolvedValue(
      supabaseStub("00000000-0000-4000-8000-000000000002"),
    );
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      hasActiveProfile: true,
    });
  });

  it("returns false for an invalid roomId rather than throwing", async () => {
    expect(await getActiveDesignProfile("not-a-uuid")).toEqual({ hasActiveProfile: false });
  });

  it("returns false when a query encounters an error", async () => {
    createClientMock.mockResolvedValue(supabaseStub(undefined, "design_system_profiles"));
    expect(await getActiveDesignProfile("00000000-0000-4000-8000-000000000001")).toEqual({
      hasActiveProfile: false,
    });
  });
});
