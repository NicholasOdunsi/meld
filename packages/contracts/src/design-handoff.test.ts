import { describe, expect, it } from "vitest";
import { DesignHandoffManifestSchema } from "./design-handoff";

describe("DesignHandoffManifestSchema", () => {
  const base = {
    screens: [
      {
        screenId: "11111111-1111-4111-8111-111111111111",
        name: "Home",
        currentVersionId: "22222222-2222-4222-8222-222222222222",
      },
    ],
  };

  it("parses a manifest with a built screen", () => {
    expect(DesignHandoffManifestSchema.parse(base).screens[0].name).toBe(
      "Home",
    );
  });

  it("accepts a screen with a null currentVersionId", () => {
    const manifest = {
      screens: [
        {
          screenId: "11111111-1111-4111-8111-111111111111",
          name: "Home",
          currentVersionId: null,
        },
      ],
    };
    expect(
      DesignHandoffManifestSchema.parse(manifest).screens[0].currentVersionId,
    ).toBeNull();
  });

  it("accepts an empty screens list", () => {
    expect(DesignHandoffManifestSchema.parse({ screens: [] }).screens).toEqual(
      [],
    );
  });

  it("rejects a screen entry missing a name", () => {
    const manifest = {
      screens: [
        {
          screenId: "11111111-1111-4111-8111-111111111111",
          currentVersionId: null,
        },
      ],
    };
    expect(DesignHandoffManifestSchema.safeParse(manifest).success).toBe(
      false,
    );
  });

  it("rejects a screen entry with a non-uuid screenId", () => {
    const manifest = {
      screens: [{ screenId: "not-a-uuid", name: "Home", currentVersionId: null }],
    };
    expect(DesignHandoffManifestSchema.safeParse(manifest).success).toBe(
      false,
    );
  });

  it("rejects extra keys on a screen entry", () => {
    const manifest = {
      screens: [{ ...base.screens[0], extra: 1 }],
    };
    expect(DesignHandoffManifestSchema.safeParse(manifest).success).toBe(
      false,
    );
  });

  it("rejects extra keys on the manifest itself", () => {
    expect(
      DesignHandoffManifestSchema.safeParse({ ...base, extra: 1 }).success,
    ).toBe(false);
  });
});
