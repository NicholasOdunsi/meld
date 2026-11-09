import { describe, expect, it } from "vitest";
import { nextTabName, orderProjectTabs } from "./project-tabs";

const room = (id: string, projectId: string, createdAt: string) => ({
  id,
  projectId,
  name: id,
  createdAt,
});

describe("orderProjectTabs", () => {
  it("keeps only the project's rooms, oldest first", () => {
    const rooms = [
      room("c", "p1", "2026-11-03T00:00:00Z"),
      room("x", "p2", "2026-11-01T00:00:00Z"),
      room("a", "p1", "2026-11-01T00:00:00Z"),
      room("b", "p1", "2026-11-02T00:00:00Z"),
    ];
    expect(orderProjectTabs(rooms, "p1").map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("breaks createdAt ties by id", () => {
    const t = "2026-11-01T00:00:00Z";
    expect(
      orderProjectTabs([room("b", "p", t), room("a", "p", t)], "p").map(
        (r) => r.id,
      ),
    ).toEqual(["a", "b"]);
  });
});

describe("nextTabName", () => {
  it("starts with New chat", () => {
    expect(nextTabName(["Main"])).toBe("New chat");
  });

  it("numbers after the first free slot, ignoring case", () => {
    expect(nextTabName(["Main", "new chat", "New chat 3"])).toBe("New chat 2");
    expect(nextTabName(["New chat", "New chat 2"])).toBe("New chat 3");
  });
});
