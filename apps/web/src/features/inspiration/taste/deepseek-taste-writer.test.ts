import { describe, expect, it, vi } from "vitest";
import { createDeepSeekTasteWriter, TasteWriterError, type TasteWriterInput } from "./deepseek-taste-writer";

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
const empty = { total: 0, themes: [], devices: [], screenTypes: [], colors: [], styleWords: [], patterns: [] };
const INPUT: TasteWriterInput = {
  stats: { ...empty, recent: empty },
  board: null,
  locks: {},
  rejectedKeys: [],
  redoSignals: [],
};
const reply = (content: unknown, ok = true) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: ok ? 200 : 500 }));

describe("createDeepSeekTasteWriter", () => {
  it("returns a validated first board and sends JSON mode with the model", async () => {
    const fetch = reply({ board: BOARD });
    const writer = createDeepSeekTasteWriter({ apiKey: "k", model: "m", fetch });
    await expect(writer.firstBoard(INPUT)).resolves.toEqual(BOARD);
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("m");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("returns validated suggestions", async () => {
    const writer = createDeepSeekTasteWriter({
      apiKey: "k",
      model: "m",
      fetch: reply({ suggestions: [{ tile: "density", op: "set", value: "balanced", reason: "r", evidenceItemIds: [] }] }),
    });
    await expect(writer.suggest({ ...INPUT, board: BOARD as never })).resolves.toHaveLength(1);
  });

  it("rejects the whole response when any part is invalid", async () => {
    const writer = createDeepSeekTasteWriter({
      apiKey: "k",
      model: "m",
      fetch: reply({ suggestions: [{ tile: "density", op: "set", value: "huge", reason: "r", evidenceItemIds: [] }] }),
    });
    await expect(writer.suggest(INPUT)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("maps HTTP and JSON failures to codes", async () => {
    await expect(
      createDeepSeekTasteWriter({ apiKey: "k", model: "m", fetch: reply({}, false) }).firstBoard(INPUT),
    ).rejects.toBeInstanceOf(TasteWriterError);
    const notJson = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "nope" } }] })));
    await expect(
      createDeepSeekTasteWriter({ apiKey: "k", model: "m", fetch: notJson }).firstBoard(INPUT),
    ).rejects.toMatchObject({ code: "bad_json" });
  });
});
