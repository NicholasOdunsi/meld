import { expect, it } from "vitest";
import { PRODUCT_AGENT_MENTION } from "./brief-opener";
import { ASK_ERROR_MESSAGE, buildAskOpener } from "./ask-opener";

it("has failure copy that names the thing that did not happen", () => {
  expect(ASK_ERROR_MESSAGE).toBe(
    "We could not start a room. Please try again.",
  );
});

it("addresses the Product Agent and keeps the question verbatim", () => {
  const opener = buildAskOpener("How do refunds work?");

  expect(opener).toBe(`${PRODUCT_AGENT_MENTION} — How do refunds work?`);
});

it("trims the question", () => {
  expect(buildAskOpener("  hello  ")).toBe(
    `${PRODUCT_AGENT_MENTION} — hello`,
  );
});
