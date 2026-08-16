// @vitest-environment jsdom

import {
  MAX_PRD_ASSIST_SECTIONS,
  MAX_PRD_ASSIST_SECTION_QUOTE_CHARS,
  MAX_PRD_ASSIST_TOTAL_QUOTE_CHARS,
  PRD_SECTION_ORDER,
} from "@meld/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePrdSelection } from "./prd-selection";
import { PRD_SECTIONS } from "./prd-sections";

// One text node per rendered section, returned positionally: a scope may
// legitimately be asked to reject a DOM that repeats a field, so the helper
// cannot key on the field name.
function renderSections(
  sections: Array<{ field: string; text: string }>,
): Text[] {
  const root = document.createElement("main");
  const nodes: Text[] = [];
  for (const { field, text } of sections) {
    const element = document.createElement("section");
    element.dataset.prdSectionField = field;
    const node = document.createTextNode(text);
    element.append(node);
    root.append(element);
    nodes.push(node);
  }
  document.body.append(root);
  return nodes;
}

type Point = { node: Node; offset: number };

function select(start: Point, end: Point, direction: "forward" | "backward") {
  const selection = window.getSelection();
  if (!selection) throw new Error("jsdom has no Selection");
  selection.removeAllRanges();
  const [anchor, focus] =
    direction === "forward" ? [start, end] : [end, start];
  selection.setBaseAndExtent(
    anchor.node,
    anchor.offset,
    focus.node,
    focus.offset,
  );
  return selection;
}

function wholeOf(node: Text): Point {
  return { node, offset: node.data.length };
}

const labelOf = (field: string) =>
  PRD_SECTIONS.find((section) => section.field === field)!.label;

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("resolvePrdSelection", () => {
  it("resolves a single-section selection to one ordered fragment", () => {
    const [node] = renderSections([
      { field: "risksAndMitigations", text: "Laptop sleep interrupts sync" },
    ]);

    expect(
      resolvePrdSelection(
        select({ node, offset: 0 }, wholeOf(node), "forward"),
      ),
    ).toEqual([
      {
        field: "risksAndMitigations",
        label: labelOf("risksAndMitigations"),
        quotedText: "Laptop sleep interrupts sync",
      },
    ]);
  });

  it("ignores a collapsed selection", () => {
    const [node] = renderSections([
      { field: "executiveSummary", text: "Summary" },
    ]);

    expect(
      resolvePrdSelection(
        select({ node, offset: 2 }, { node, offset: 2 }, "forward"),
      ),
    ).toBeNull();
  });

  it("ignores a selection outside any PRD section", () => {
    const paragraph = document.createElement("p");
    const node = document.createTextNode("not scoped");
    paragraph.append(node);
    document.body.append(paragraph);

    expect(
      resolvePrdSelection(
        select({ node, offset: 0 }, wholeOf(node), "forward"),
      ),
    ).toBeNull();
  });

  it.each(["forward", "backward"] as const)(
    "resolves a %s selection across three sections in document order",
    (direction) => {
      const [first, , last] = renderSections([
        { field: "executiveSummary", text: "One sentence summary." },
        { field: "problemAndEvidence", text: "Sync breaks on sleep." },
        { field: "targetUsersAndUseCases", text: "Field engineers." },
      ]);

      // Starts mid-way through the first section and stops mid-way through
      // the last, so only a partial fragment survives at each end while the
      // middle section is carried whole.
      expect(
        resolvePrdSelection(
          select({ node: first, offset: 4 }, { node: last, offset: 5 }, direction),
        ),
      ).toEqual([
        {
          field: "executiveSummary",
          label: labelOf("executiveSummary"),
          quotedText: "sentence summary.",
        },
        {
          field: "problemAndEvidence",
          label: labelOf("problemAndEvidence"),
          quotedText: "Sync breaks on sleep.",
        },
        {
          field: "targetUsersAndUseCases",
          label: labelOf("targetUsersAndUseCases"),
          quotedText: "Field",
        },
      ]);
    },
  );

  it("rejects a selection that begins outside a PRD section", () => {
    const heading = document.createElement("h1");
    const outside = document.createTextNode("Page title");
    heading.append(outside);
    document.body.append(heading);
    const [summary] = renderSections([
      { field: "executiveSummary", text: "One sentence summary." },
    ]);

    expect(
      resolvePrdSelection(
        select({ node: outside, offset: 0 }, wholeOf(summary), "forward"),
      ),
    ).toBeNull();
  });

  it("rejects a selection that ends outside a PRD section", () => {
    const [summary] = renderSections([
      { field: "executiveSummary", text: "One sentence summary." },
    ]);
    const footer = document.createElement("footer");
    const outside = document.createTextNode("Not a section");
    footer.append(outside);
    document.body.append(footer);

    expect(
      resolvePrdSelection(
        select({ node: summary, offset: 0 }, wholeOf(outside), "forward"),
      ),
    ).toBeNull();
  });

  it("rejects a selection whose sections repeat a field", () => {
    const [first, second] = renderSections([
      { field: "executiveSummary", text: "One sentence summary." },
      { field: "executiveSummary", text: "The same field again." },
    ]);

    expect(
      resolvePrdSelection(
        select({ node: first, offset: 0 }, wholeOf(second), "forward"),
      ),
    ).toBeNull();
  });

  it("accepts the whole document at the section limit and rejects one more", () => {
    // There are exactly MAX_PRD_ASSIST_SECTIONS renderable fields, so a scope
    // can only exceed the cap by repeating one. Pin both halves of that.
    expect(PRD_SECTION_ORDER).toHaveLength(MAX_PRD_ASSIST_SECTIONS);

    const all = PRD_SECTION_ORDER.map((field) => ({ field, text: `${field} body` }));
    const atLimit = renderSections(all);
    expect(
      resolvePrdSelection(
        select({ node: atLimit[0], offset: 0 }, wholeOf(atLimit.at(-1)!), "forward"),
      ),
    ).toHaveLength(MAX_PRD_ASSIST_SECTIONS);

    document.body.replaceChildren();
    const overLimit = renderSections([
      ...all,
      { field: PRD_SECTION_ORDER[0], text: "one section too many" },
    ]);
    expect(overLimit).toHaveLength(MAX_PRD_ASSIST_SECTIONS + 1);
    expect(
      resolvePrdSelection(
        select(
          { node: overLimit[0], offset: 0 },
          wholeOf(overLimit.at(-1)!),
          "forward",
        ),
      ),
    ).toBeNull();
  });

  it("rejects a single fragment longer than the per-section quote limit", () => {
    const [node] = renderSections([
      {
        field: "executiveSummary",
        text: "x".repeat(MAX_PRD_ASSIST_SECTION_QUOTE_CHARS + 1),
      },
    ]);

    expect(
      resolvePrdSelection(select({ node, offset: 0 }, wholeOf(node), "forward")),
    ).toBeNull();
  });

  it("accepts the total-character limit exactly and rejects one past it", () => {
    const half = MAX_PRD_ASSIST_TOTAL_QUOTE_CHARS / 2;
    const atLimit = renderSections([
      { field: "executiveSummary", text: "x".repeat(half) },
      { field: "problemAndEvidence", text: "y".repeat(half) },
    ]);

    expect(
      resolvePrdSelection(
        select({ node: atLimit[0], offset: 0 }, wholeOf(atLimit.at(-1)!), "forward"),
      ),
    ).toHaveLength(2);

    document.body.replaceChildren();
    const tooMuch = renderSections([
      { field: "executiveSummary", text: "x".repeat(half) },
      { field: "problemAndEvidence", text: "y".repeat(half) },
      { field: "targetUsersAndUseCases", text: "z" },
    ]);
    expect(
      resolvePrdSelection(
        select({ node: tooMuch[0], offset: 0 }, wholeOf(tooMuch.at(-1)!), "forward"),
      ),
    ).toBeNull();
  });

  it("drops a section the selection only touches at its boundary", () => {
    const [summary, problem] = renderSections([
      { field: "executiveSummary", text: "One sentence summary." },
      { field: "problemAndEvidence", text: "Sync breaks on sleep." },
    ]);

    expect(
      resolvePrdSelection(
        select(
          { node: summary, offset: 0 },
          { node: problem, offset: 0 },
          "forward",
        ),
      ),
    ).toEqual([
      {
        field: "executiveSummary",
        label: labelOf("executiveSummary"),
        quotedText: "One sentence summary.",
      },
    ]);
  });

  it("rejects a selection inside an unknown section field", () => {
    const [node] = renderSections([{ field: "notAPrdField", text: "Nope." }]);

    expect(
      resolvePrdSelection(select({ node, offset: 0 }, wholeOf(node), "forward")),
    ).toBeNull();
  });
});
