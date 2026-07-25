import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next local development configuration", () => {
  it("allows the canonical 127.0.0.1 development origin", () => {
    expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
  });
});
