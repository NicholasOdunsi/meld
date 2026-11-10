import { describe, expect, it } from "vitest";
import { TASTE_INTERPRETER_PROMPT } from "./interpreter-prompt";

describe("TASTE_INTERPRETER_PROMPT", () => {
  it("offers motion, shape and voice and never colours", () => {
    expect(TASTE_INTERPRETER_PROMPT).toContain("motion, shape, voice");
    expect(TASTE_INTERPRETER_PROMPT).toContain("never colors");
    expect(TASTE_INTERPRETER_PROMPT).not.toContain("colors item");
  });
});
