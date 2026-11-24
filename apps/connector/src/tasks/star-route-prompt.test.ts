import { describe, expect, it } from "vitest";
import { parseStarRouteResult, STAR_ROUTE_RESPONSE_SCHEMA, STAR_ROUTE_SYSTEM_PROMPT } from "./star-route-prompt";

const starTaskId = "10000000-0000-4000-8000-000000000001";

describe("Star route prompt", () => {
  it("treats message and Star titles as untrusted data", () => {
    expect(STAR_ROUTE_SYSTEM_PROMPT).toContain("untrusted data");
    expect(STAR_ROUTE_SYSTEM_PROMPT).toContain("Never invent a Star id");
  });

  it("asks the model for the build intent", () => {
    expect(STAR_ROUTE_SYSTEM_PROMPT).toContain("intent");
    expect(STAR_ROUTE_RESPONSE_SCHEMA.required).toContain("intent");
    expect(parseStarRouteResult({ decision: "new", starTaskId: null, confidence: 0.9, intent: "build" }).intent).toBe("build");
  });

  it("asks instead of silently filing a weak continuation", () => {
    expect(parseStarRouteResult({ decision: "continue", starTaskId, confidence: 0.69 }))
      .toEqual({ decision: "ask", starTaskId, confidence: 0.69, intent: "answer" });
    expect(parseStarRouteResult({ decision: "continue", starTaskId, confidence: 0.9 }))
      .toEqual({ decision: "continue", starTaskId, confidence: 0.9, intent: "answer" });
  });

  it("rejects a fabricated or impossible result", () => {
    expect(() => parseStarRouteResult({ decision: "continue", starTaskId: null, confidence: 0.9 })).toThrow();
    expect(() => parseStarRouteResult({ decision: "new", starTaskId, confidence: 0.9 })).toThrow();
  });
});
