import { expect, it } from "vitest";
import { tabDisplayName } from "./tab-naming";

it("never adds a generation number to a fallback tab name", () => {
  expect(
    tabDisplayName({ name: null, position: 7, panes: [] }),
  ).toBe("Hvitserk");
});
