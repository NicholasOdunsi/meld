import { describe, expect, it, vi } from "vitest";
import type { TasteBoard } from "@meld/contracts";
import { runCompose, type ComposeDeps, type ComposeInput } from "./run-compose";

const BOARD: TasteBoard = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "regular", tracking: "normal", note: "" },
  spacing: "comfortable",
  density: "balanced",
  layoutHabits: [],
  signatureDetails: [],
  avoid: [],
};
const ID = "44444444-4444-4444-8444-444444444444";
const CARD = {
  tile: "spacing",
  op: "set",
  value: "generous",
  reason: "Generous whitespace",
  source: { kind: "file", name: "Brand.pdf", locator: "page 3" },
};
const EMPTY: ComposeInput = {
  words: "",
  urls: [],
  files: [],
  libraryItemIds: [],
  tile: null,
  preset: null,
  replyTo: [],
};

function deps(over: Partial<ComposeDeps> = {}): ComposeDeps & { added: unknown[] } {
  const added: unknown[] = [];
  const taste = {
    get: async () => ({
      ok: true as const,
      value: {
        board: BOARD,
        version: 2,
        appleRules: true,
        pending: added.length
          ? [
              {
                id: ID,
                tile: "spacing" as const,
                op: "set" as const,
                value: "generous",
                reason: "Generous whitespace",
                evidenceItemIds: [] as string[],
                origin: "composer" as const,
                source: CARD.source,
              },
            ]
          : [],
      },
    }),
    rejectedKeys: async () => ({ ok: true as const, value: [] as string[] }),
    addCards: async (entries: unknown[]) => {
      added.push(...entries);
      return { ok: true as const, value: { ids: [ID] } };
    },
  };
  return {
    added,
    taste: taste as never,
    interpreter: { model: "m", interpret: vi.fn(async () => [CARD as never]) },
    labelImage: vi.fn(
      async () =>
        ({
          device: "web",
          screenType: "login",
          patterns: [],
          theme: "light",
          colors: ["#ffffff"],
          styleWords: ["minimal"],
          description: "Airy",
        }) as never,
    ),
    libraryLabels: vi.fn(async () => []),
    fetchLink: vi.fn(async (url: string) => ({ ok: true as const, name: new URL(url).hostname, text: "calm brand" })),
    extract: vi.fn(async (file: { name: string }) => ({
      ok: true as const,
      name: file.name,
      text: "[page 3] generous whitespace",
      pages: null,
    })),
    ...over,
  };
}

describe("runCompose", () => {
  it("turns words into stored cards", async () => {
    const d = deps();
    const out = await runCompose({ ...EMPTY, words: "calm and spacious" }, d);
    expect(out).toMatchObject({ ok: true, cards: [{ id: ID, tile: "spacing", origin: "composer" }] });
    expect(d.added).toHaveLength(1);
    expect(d.interpreter!.interpret).toHaveBeenCalledWith(expect.objectContaining({ words: "calm and spacious" }));
  });

  it("reads files, links and images into sources, and reports what it skipped", async () => {
    const d = deps({
      extract: vi.fn(async (f: { name: string }) =>
        f.name === "bad.pdf"
          ? { ok: false as const, name: f.name, reason: "unreadable" as const }
          : { ok: true as const, name: f.name, text: "t", pages: null },
      ),
    });
    const out = await runCompose(
      {
        ...EMPTY,
        urls: ["https://example.com/brand"],
        files: [
          { name: "ok.txt", mimeType: "text/plain", bytes: new Uint8Array([1]) },
          { name: "bad.pdf", mimeType: "application/pdf", bytes: new Uint8Array([1]) },
          { name: "shot.png", mimeType: "image/png", bytes: new Uint8Array([1]) },
        ],
      },
      d,
    );
    expect(out.ok && out.skipped).toEqual([{ name: "bad.pdf", reason: "Couldn't read this file" }]);
    const call = (d.interpreter!.interpret as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.sources.map((s: { name: string; kind: string }) => `${s.kind}:${s.name}`)).toEqual([
      "link:example.com",
      "file:ok.txt",
      "image:shot.png",
    ]);
    expect(call.sources[2].text).toContain("minimal");
  });

  it("uses the Apple preset without the interpreter", async () => {
    const d = deps({ interpreter: null });
    const out = await runCompose({ ...EMPTY, preset: "apple" }, d);
    expect(out.ok).toBe(true);
    expect(d.added.length).toBeGreaterThan(0);
    expect((d.added[0] as { origin: string }).origin).toBe("preset");
  });

  it("is unavailable without an interpreter and invalid without input", async () => {
    expect(await runCompose({ ...EMPTY, words: "x" }, deps({ interpreter: null }))).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(await runCompose(EMPTY, deps())).toEqual({ ok: false, error: "invalid_request" });
    expect(await runCompose({ ...EMPTY, words: "x".repeat(4001) }, deps())).toEqual({
      ok: false,
      error: "invalid_request",
    });
    expect(
      await runCompose(
        { ...EMPTY, urls: ["https://a.com", "https://b.com", "https://c.com", "https://d.com"] },
        deps(),
      ),
    ).toEqual({ ok: false, error: "invalid_request" });
  });

  it("keeps only the scoped tile and passes replyTo to storage", async () => {
    const d = deps({
      interpreter: {
        model: "m",
        interpret: async () => [CARD as never, { ...CARD, tile: "density", value: "airy" } as never],
      },
    });
    await runCompose({ ...EMPTY, words: "more room", tile: "spacing", replyTo: [ID] }, d);
    expect(d.added).toHaveLength(1);
    expect((d.added[0] as { card: { tile: string } }).card.tile).toBe("spacing");
  });

  it("maps interpreter failure to unavailable and an empty answer to no cards", async () => {
    expect(
      await runCompose(
        { ...EMPTY, words: "x" },
        deps({
          interpreter: {
            model: "m",
            interpret: async () => {
              throw new Error("boom");
            },
          },
        }),
      ),
    ).toEqual({ ok: false, error: "unavailable" });
    const out = await runCompose(
      { ...EMPTY, words: "x" },
      deps({ interpreter: { model: "m", interpret: async () => [] } }),
    );
    expect(out).toEqual({ ok: true, cards: [], skipped: [] });
  });
});
