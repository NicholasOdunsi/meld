import { expect, it } from "vitest";
import { toPendingKind } from "./pending";

it("maps mentions and assigned work to review", () => {
  expect(toPendingKind("mention")).toBe("review");
  expect(toPendingKind("assigned_work")).toBe("review");
});

it("maps holds to approve", () => {
  expect(toPendingKind("approval_request")).toBe("approve");
  expect(toPendingKind("agent_result_review")).toBe("approve");
});

it("maps failures to failed", () => {
  expect(toPendingKind("agent_run_failed")).toBe("failed");
});

it("maps idle rooms to stale", () => {
  expect(toPendingKind("room_idle")).toBe("stale");
});

it("falls back to review for an unmapped kind", () => {
  expect(toPendingKind("decision_needed")).toBe("review");
});
