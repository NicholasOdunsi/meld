import { describe, expect, it } from "vitest";
import { AITaskKindSchema, StarRouteResultSchema } from "./ai";

const starId = "10000000-0000-4000-8000-000000000001";

describe("Star route contract", () => {
  it("accepts the task kind and the three decisions", () => {
    expect(AITaskKindSchema.parse("star_route")).toBe("star_route");
    for (const value of [
      { decision: "continue", starTaskId: starId, confidence: 0.95 },
      { decision: "ask", starTaskId: starId, confidence: 0.55 },
      { decision: "new", starTaskId: null, confidence: 0.91 },
    ]) expect(StarRouteResultSchema.parse(value)).toEqual({ ...value, intent: "answer" });
  });

  it("carries the build intent", () => {
    expect(StarRouteResultSchema.parse({ decision: "new", starTaskId: null, confidence: 0.9, intent: "build" }).intent).toBe("build");
    expect(StarRouteResultSchema.parse({ decision: "new", starTaskId: null, confidence: 0.9, intent: "unsure" }).intent).toBe("unsure");
    expect(StarRouteResultSchema.safeParse({ decision: "new", starTaskId: null, confidence: 0.9, intent: "deploy" }).success).toBe(false);
  });

  it("rejects impossible decisions and confidence", () => {
    for (const value of [
      { decision: "continue", starTaskId: null, confidence: 0.9 },
      { decision: "ask", starTaskId: null, confidence: 0.5 },
      { decision: "new", starTaskId: starId, confidence: 0.9 },
      { decision: "new", starTaskId: null, confidence: 1.1 },
      { decision: "continue", starTaskId: "wrong", confidence: 0.9 },
    ]) expect(StarRouteResultSchema.safeParse(value).success).toBe(false);
  });
});
