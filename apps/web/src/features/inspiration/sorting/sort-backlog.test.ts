import { describe, expect, it, vi } from "vitest";
import { LabelerError, type InspirationLabeler } from "./deepseek-labeler";
import { sortInspirationBacklog } from "./sort-backlog";

const WS = "11111111-1111-4111-8111-111111111111";
const ITEM_A = "22222222-2222-4222-8222-222222222222";
const ITEM_B = "33333333-3333-4333-8333-333333333333";
const LABELS = {
  device: "mobile", screenType: "login", patterns: ["form"], theme: "dark",
  colors: ["#000000"], styleWords: [], description: "Bold.",
} as const;

function client(
  claimed: unknown[],
  download: ReturnType<typeof vi.fn> = vi.fn(async () => ({ data: new Blob([new Uint8Array([7])]), error: null })),
) {
  const rpc = vi.fn(async (name: string) => (name === "claim_inspiration_sort" ? { data: claimed, error: null } : { data: true, error: null }));
  return { rpc, storage: { from: vi.fn(() => ({ download })) }, download };
}

function labeler(impl: InspirationLabeler["label"]): InspirationLabeler {
  return { model: "deepseek-flash", label: vi.fn(impl) };
}

const row = (id: string) => ({ item_id: id, storage_path: `${WS}/${id}.png`, mime_type: "image/png" });

describe("sortInspirationBacklog", () => {
  it("claims a batch, labels each item and saves it", async () => {
    const fake = client([row(ITEM_A)]);
    const result = await sortInspirationBacklog(WS, { client: fake as never, labeler: labeler(async () => ({ ...LABELS, patterns: ["form"], colors: ["#000000"], styleWords: [] })) });

    expect(result).toEqual({ sorted: 1, failed: 0 });
    expect(fake.rpc).toHaveBeenCalledWith("claim_inspiration_sort", { target_workspace_id: WS, batch_limit: 10 });
    expect(fake.download).toHaveBeenCalledWith(`${WS}/${ITEM_A}.png`);
    expect(fake.rpc).toHaveBeenCalledWith("save_inspiration_labels", expect.objectContaining({ target_item_id: ITEM_A, labels_model: "deepseek-flash" }));
  });

  it("releases an item when labeling fails and keeps going", async () => {
    const fake = client([row(ITEM_A), row(ITEM_B)]);
    let call = 0;
    const result = await sortInspirationBacklog(WS, {
      client: fake as never,
      labeler: labeler(async () => {
        call += 1;
        if (call === 1) throw new LabelerError("http");
        return { ...LABELS, patterns: ["form"], colors: ["#000000"], styleWords: [] };
      }),
    });

    expect(result).toEqual({ sorted: 1, failed: 1 });
    expect(fake.rpc).toHaveBeenCalledWith("release_inspiration_sort", { target_item_id: ITEM_A });
  });

  it("releases an item whose download fails", async () => {
    const fake = client([row(ITEM_A)], vi.fn(async () => ({ data: null, error: { message: "gone" } })));
    const label = vi.fn();
    const result = await sortInspirationBacklog(WS, { client: fake as never, labeler: { model: "m", label } });
    expect(result).toEqual({ sorted: 0, failed: 1 });
    expect(label).not.toHaveBeenCalled();
    expect(fake.rpc).toHaveBeenCalledWith("release_inspiration_sort", { target_item_id: ITEM_A });
  });

  it("does nothing when the claim fails", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "42501" } }));
    const result = await sortInspirationBacklog(WS, { client: { rpc } as never, labeler: { model: "m", label: vi.fn() } });
    expect(result).toEqual({ sorted: 0, failed: 0 });
  });
});
