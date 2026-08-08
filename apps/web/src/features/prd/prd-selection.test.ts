// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { resolvePrdSelection } from "./prd-selection";

function makeSelection(
  root: HTMLElement,
  quotedText: string,
  collapsed = false,
): Selection {
  const text = document.createTextNode(quotedText);
  root.append(text);
  return {
    isCollapsed: collapsed,
    toString: () => (collapsed ? "" : quotedText),
    anchorNode: text,
    focusNode: text,
  } as unknown as Selection;
}

describe("resolvePrdSelection", () => {
  it("resolves a non-empty selection to its section field", () => {
    const section = document.createElement("section");
    section.dataset.prdSectionField = "risksAndMitigations";
    const selection = makeSelection(section, "Laptop sleep interrupts sync");

    expect(resolvePrdSelection(selection)).toEqual({
      field: "risksAndMitigations",
      quotedText: "Laptop sleep interrupts sync",
    });
  });

  it("ignores a collapsed selection", () => {
    const section = document.createElement("section");
    section.dataset.prdSectionField = "executiveSummary";
    expect(resolvePrdSelection(makeSelection(section, "Summary", true))).toBeNull();
  });

  it("ignores selections outside a PRD section", () => {
    const paragraph = document.createElement("p");
    const selection = makeSelection(paragraph, "not scoped");
    expect(resolvePrdSelection(selection)).toBeNull();
  });
});
