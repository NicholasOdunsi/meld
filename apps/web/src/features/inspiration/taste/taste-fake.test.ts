// apps/web/src/features/inspiration/taste/taste-fake.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { fakeAddDislike, fakeDecide, fakeGetTasteView, fakeHasPending, resetTasteFake } from "./taste-fake";

describe("taste fake", () => {
  beforeEach(() => resetTasteFake());

  it("seeds a board with two pending suggestions", () => {
    const view = fakeGetTasteView();
    expect(view.status).toBe("ready");
    expect(view.status === "ready" && view.pending).toHaveLength(2);
    expect(fakeHasPending()).toBe(true);
  });

  it("keep applies; not me on an add records a dislike", () => {
    const before = fakeGetTasteView();
    if (before.status !== "ready") throw new Error("seed");
    const [add, set] = [before.pending.find((p) => p.tile === "signatureDetails")!, before.pending.find((p) => p.tile === "density")!];
    expect(fakeDecide({ suggestionId: set.id, decision: "kept" }).status).toBe("kept");
    expect(fakeDecide({ suggestionId: add.id, decision: "rejected" }).status).toBe("rejected");
    const after = fakeGetTasteView();
    if (after.status !== "ready") throw new Error("after");
    expect(after.board.density).toBe("balanced");
    expect(after.board.avoid.map((a) => a.text)).toContain("Pill buttons");
    expect(after.pending).toHaveLength(0);
  });

  it("adds a typed dislike with a version check", () => {
    const view = fakeGetTasteView();
    if (view.status !== "ready") throw new Error("seed");
    expect(fakeAddDislike({ text: "gradients", expectedVersion: view.version - 1 }).status).toBe("conflict");
    expect(fakeAddDislike({ text: "gradients", expectedVersion: view.version }).status).toBe("saved");
  });
});
