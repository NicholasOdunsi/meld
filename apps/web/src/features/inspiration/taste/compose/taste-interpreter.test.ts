import { describe, expect, it, vi } from "vitest";
import type { TasteBoard } from "@meld/contracts";
import {
  createDeepSeekTasteInterpreter,
  filterComposerCards,
  TasteInterpreterError,
} from "./taste-interpreter";

const BOARD: TasteBoard = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "regular", tracking: "normal", note: "" },
  spacing: "generous",
  density: "balanced",
  layoutHabits: [],
  signatureDetails: [],
  avoid: [],
};
const card = (over: Record<string, unknown> = {}) => ({
  tile: "density",
  op: "set",
  value: "airy",
  reason: "Brand guide: generous whitespace",
  source: { kind: "file", name: "Brand.pdf", locator: "page 6" },
  ...over,
});
const reply = (cards: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ cards }) } }] }), {
    status: 200,
  });
const INPUT = { words: "calm", sources: [], board: BOARD, rejectedKeys: [], tile: null, pending: [] };

describe("createDeepSeekTasteInterpreter", () => {
  it("returns valid cards and drops invalid ones", async () => {
    const fetch = vi.fn(async () => reply([card(), card({ value: "roomy" }), card({ tile: "mood" })]));
    const out = await createDeepSeekTasteInterpreter({ apiKey: "k", model: "m", fetch }).interpret(INPUT);
    expect(out).toHaveLength(1);
    expect(out[0].tile).toBe("density");
  });
  it("sends the input as JSON and tells the model input is data", async () => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages[0].content).toMatch(/untrusted/i);
      expect(JSON.parse(body.messages[1].content).words).toBe("calm");
      return reply([]);
    });
    await createDeepSeekTasteInterpreter({ apiKey: "k", model: "m", fetch }).interpret(INPUT);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("throws on http errors and on non-JSON replies", async () => {
    await expect(
      createDeepSeekTasteInterpreter({
        apiKey: "k",
        model: "m",
        fetch: async () => new Response("", { status: 500 }),
      }).interpret(INPUT),
    ).rejects.toMatchObject({ code: "http" });
    await expect(
      createDeepSeekTasteInterpreter({
        apiKey: "k",
        model: "m",
        fetch: async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "nope" } }] })),
      }).interpret(INPUT),
    ).rejects.toBeInstanceOf(TasteInterpreterError);
  });
  it("caps the result at 8 cards", async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      card({ tile: "layoutHabits", op: "add", value: `habit ${i}` }),
    );
    const out = await createDeepSeekTasteInterpreter({
      apiKey: "k",
      model: "m",
      fetch: async () => reply(many),
    }).interpret(INPUT);
    expect(out).toHaveLength(8);
  });
});

describe("filterComposerCards", () => {
  const parsed = (over?: Record<string, unknown>) => card(over) as never;
  it("drops no-ops and previously rejected values", () => {
    expect(filterComposerCards([parsed({ value: "balanced" })], BOARD, [])).toEqual([]); // already balanced
    expect(filterComposerCards([parsed()], BOARD, ["density:set:airy"])).toEqual([]);
    expect(filterComposerCards([parsed()], BOARD, [])).toHaveLength(1);
  });
  it("drops duplicate cards for the same change", () => {
    expect(filterComposerCards([parsed(), parsed()], BOARD, [])).toHaveLength(1);
  });
  it("drops colour cards: the composer never proposes colours", () => {
    const colourCard = { tile: "colors", op: "add", value: { hex: "#ff5a36", role: "accent" }, reason: "r", source: { kind: "words", name: "Your words", locator: "" } } as const;
    const motionCard = { tile: "motion", op: "set", value: "smooth", reason: "r", source: { kind: "words", name: "Your words", locator: "" } } as const;
    const out = filterComposerCards([colourCard, motionCard], BOARD, []);
    expect(out.map((card) => card.tile)).toEqual(["motion"]);
  });
});
