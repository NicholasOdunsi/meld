import { describe, expect, it } from "vitest";
import {
  DISTILL_STEPS,
  phaseFromTaskStatus,
  stepState,
} from "./design-distill-progress";

describe("phaseFromTaskStatus", () => {
  it("reads running as a device actually working on it", () => {
    expect(phaseFromTaskStatus("running")).toBe("reading");
  });

  it.each(["queued", "waiting_for_device", "ready_to_run"] as const)(
    "reads %s as still waiting to be picked up",
    (status) => {
      expect(phaseFromTaskStatus(status)).toBe("queued");
    },
  );

  it("treats a status the projection has not reported yet as waiting", () => {
    // Claiming progress we cannot see would be the one dishonest answer here.
    expect(phaseFromTaskStatus(undefined)).toBe("queued");
  });
});

describe("stepState", () => {
  it("marks the current step active and earlier ones done", () => {
    expect(stepState("uploading", "reading")).toBe("done");
    expect(stepState("queued", "reading")).toBe("done");
    expect(stepState("reading", "reading")).toBe("active");
  });

  it("leaves later steps pending", () => {
    expect(stepState("queued", "uploading")).toBe("pending");
    expect(stepState("reading", "uploading")).toBe("pending");
  });

  it("completes every step once the distillation is done", () => {
    for (const step of DISTILL_STEPS) {
      expect(stepState(step.phase, "done")).toBe("done");
    }
  });

  it("does not mark anything complete on failure", () => {
    // How far it got is unknowable from here, so the list freezes rather than
    // claiming steps that may never have run.
    for (const step of DISTILL_STEPS) {
      expect(stepState(step.phase, "failed")).toBe("pending");
    }
  });

  it("keeps the steps in the order they actually happen", () => {
    expect(DISTILL_STEPS.map((step) => step.phase)).toEqual([
      "uploading",
      "queued",
      "reading",
    ]);
  });
});
