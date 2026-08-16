import { describe, expect, it } from "vitest";
import { planScreenSeeds, SCREEN_SEED_FRAME_WIDTH, SCREEN_SEED_GAP, SCREEN_SEED_BASELINE_Y } from "./screen-seed";
import type { FlowDocument } from "@meld/contracts";

function flow(nodes: Array<{ id: string; kind: string; label: string }>): FlowDocument {
  return {
    title: "T", summary: "S",
    nodes: nodes.map((n) => ({ ...n, detail: null })),
    edges: [], openQuestions: [],
  } as unknown as FlowDocument;
}

describe("planScreenSeeds", () => {
  it("emits one seed per action node, in flow order, laid out in a row", () => {
    const out = planScreenSeeds(
      flow([
        { id: "start", kind: "start", label: "Start" },
        { id: "pick_plan", kind: "action", label: "Pick plan" },
        { id: "route", kind: "decision", label: "Route" },
        { id: "checkout", kind: "action", label: "Checkout" },
      ]),
      [],
    );
    expect(out).toEqual([
      { nodeId: "pick_plan", name: "Pick plan", x: 0, y: SCREEN_SEED_BASELINE_Y },
      { nodeId: "checkout", name: "Checkout", x: SCREEN_SEED_FRAME_WIDTH + SCREEN_SEED_GAP, y: SCREEN_SEED_BASELINE_Y },
    ]);
  });

  it("skips action nodes that already have a screen", () => {
    const out = planScreenSeeds(
      flow([
        { id: "pick_plan", kind: "action", label: "Pick plan" },
        { id: "checkout", kind: "action", label: "Checkout" },
      ]),
      ["pick_plan"],
    );
    expect(out).toEqual([{ nodeId: "checkout", name: "Checkout", x: 0, y: SCREEN_SEED_BASELINE_Y }]);
  });

  it("returns [] for a null flow", () => {
    expect(planScreenSeeds(null, [])).toEqual([]);
  });

  it("returns [] when every action node is already seeded", () => {
    const out = planScreenSeeds(flow([{ id: "a", kind: "action", label: "A" }]), ["a"]);
    expect(out).toEqual([]);
  });

  it("ignores non-action nodes entirely (system/decision/start/end)", () => {
    const out = planScreenSeeds(
      flow([
        { id: "s", kind: "system", label: "S" },
        { id: "d", kind: "decision", label: "D" },
        { id: "e", kind: "end", label: "E" },
      ]),
      [],
    );
    expect(out).toEqual([]);
  });
});
