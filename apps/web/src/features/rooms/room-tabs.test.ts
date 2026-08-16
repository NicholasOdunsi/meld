import { describe, expect, it } from "vitest";
import { ROOM_SURFACE_LABELS } from "./room-tabs";

describe("ROOM_SURFACE_LABELS", () => {
  it("labels the user-flows surface as Canvas", () => {
    expect(ROOM_SURFACE_LABELS["user-flows"]).toBe("Canvas");
  });
});
