import { describe, expect, it } from "vitest";
import { RoomStageSchema } from "./rooms";

describe("RoomStageSchema", () => {
  it("matches the persisted room stage enum", () => {
    expect(RoomStageSchema.options).toEqual([
      "discovery",
      "define",
      "design",
      "development",
    ]);
  });
});
