import { describe, expect, it, vi } from "vitest";
import { loadTasteBoard } from "./load-taste-board";

vi.mock("server-only", () => ({}));

function client(rows: { room?: unknown; profile?: unknown; error?: boolean }) {
  const query = (data: unknown) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data, error: rows.error ? { code: "x" } : null }),
    };
    return chain;
  };
  return {
    from: (table: string) => query(table === "rooms" ? rows.room : rows.profile),
  } as never;
}

const BOARD = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "heavy", tracking: "tight", note: "" },
  spacing: "generous",
  density: "airy",
  layoutHabits: [],
  signatureDetails: [],
  avoid: [],
};
const ROOM = { workspace_id: "00000000-0000-4000-8000-000000000001" };

describe("loadTasteBoard", () => {
  it("returns the owner's validated board", async () => {
    await expect(loadTasteBoard(client({ room: ROOM, profile: { board: BOARD } }), "r")).resolves.toEqual(BOARD);
  });
  it("returns null for no profile, an invalid board, or any error", async () => {
    await expect(loadTasteBoard(client({ room: ROOM, profile: null }), "r")).resolves.toBeNull();
    await expect(loadTasteBoard(client({ room: ROOM, profile: { board: { nope: 1 } } }), "r")).resolves.toBeNull();
    await expect(loadTasteBoard(client({ room: ROOM, profile: { board: BOARD }, error: true }), "r")).resolves.toBeNull();
  });
});
