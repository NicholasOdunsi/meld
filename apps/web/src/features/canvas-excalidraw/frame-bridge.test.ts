import { describe, expect, it } from "vitest";
import { parseFrameMessage } from "./frame-bridge";

const frame = {};
const known = (key: string) => key === "login";
const good = { source: "orion-frame", type: "goto", screenKey: "login" };

describe("parseFrameMessage", () => {
  it("accepts a well-formed goto from the frame's own window", () => {
    expect(parseFrameMessage({ source: frame, data: good }, frame, known)).toEqual(good);
  });
  it("rejects a message from another window", () => {
    expect(parseFrameMessage({ source: {}, data: good }, frame, known)).toBeNull();
  });
  it("rejects when the frame window is missing", () => {
    expect(parseFrameMessage({ source: null, data: good }, null, known)).toBeNull();
  });
  it("rejects wrong shapes, extra keys and bad keys", () => {
    for (const data of [
      null, "x", {}, { ...good, type: "open" }, { ...good, source: "other" },
      { ...good, extra: 1 }, { ...good, screenKey: "../x" }, { ...good, screenKey: "Login" },
      { ...good, screenKey: 5 },
    ]) {
      expect(parseFrameMessage({ source: frame, data }, frame, known)).toBeNull();
    }
  });
  it("rejects an unknown screen", () => {
    expect(parseFrameMessage({ source: frame, data: { ...good, screenKey: "ghost" } }, frame, known)).toBeNull();
  });
});
