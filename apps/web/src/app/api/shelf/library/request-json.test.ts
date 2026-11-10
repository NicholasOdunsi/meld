import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "./request-json";

describe("readJson", () => {
  const Schema = z.object({ a: z.number() }).strict();
  it("parses a valid body", async () => {
    expect(await readJson(new Request("http://x", { method: "POST", body: JSON.stringify({ a: 1 }) }), Schema)).toEqual({ a: 1 });
  });
  it("returns null for bad JSON or a schema mismatch", async () => {
    expect(await readJson(new Request("http://x", { method: "POST", body: "{" }), Schema)).toBeNull();
    expect(await readJson(new Request("http://x", { method: "POST", body: JSON.stringify({ a: "1" }) }), Schema)).toBeNull();
  });
});
