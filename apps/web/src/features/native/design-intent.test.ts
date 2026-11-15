import { describe, expect, it } from "vitest";
import { parseDesignMention } from "./design-intent";

describe("parseDesignMention", () => {
  it("returns the brief after a leading mention", () => {
    expect(parseDesignMention("@Design Agent a login screen")).toBe("a login screen");
    expect(parseDesignMention("  @design agent: a login screen ")).toBe("a login screen");
  });
  it("ignores ordinary messages and empty briefs", () => {
    expect(parseDesignMention("design a login screen")).toBeNull();
    expect(parseDesignMention("@Design Agent   ")).toBeNull();
  });
});
