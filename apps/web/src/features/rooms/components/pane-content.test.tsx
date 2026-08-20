// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MeldNote } from "@/ui/meld/stack";
import { PANE_TITLES, PaneContent } from "./pane-content";

vi.mock("@/features/design/components/prototype-viewer", () => ({
  PrototypeViewer: () => <MeldNote>prototype viewer</MeldNote>,
}));
vi.mock("@/features/prd/components/prd-document", () => ({
  PrdDocument: () => <MeldNote>prd document</MeldNote>,
}));
vi.mock("@/features/canvas/user-flow-trial-tab-loader", () => ({
  UserFlowTrialTab: () => <MeldNote>canvas</MeldNote>,
}));

afterEach(cleanup);

it("titles each tool", () => {
  expect(PANE_TITLES).toEqual({
    canvas: "Canvas",
    prototype: "Prototype",
    prd: "PRD",
  });
});

it("renders the PRD document for the prd tool", () => {
  render(
    <PaneContent
      tool="prd"
      data={{ prd: null, prototype: null, canvas: null }}
    />,
  );

  expect(screen.getByText("prd document")).toBeInTheDocument();
});

it("renders the prototype viewer for the prototype tool", () => {
  render(
    <PaneContent
      tool="prototype"
      data={{ prd: null, prototype: null, canvas: null }}
    />,
  );

  expect(screen.getByText("prototype viewer")).toBeInTheDocument();
});

it("renders the canvas for the canvas tool", () => {
  render(
    <PaneContent
      tool="canvas"
      data={{ prd: null, prototype: null, canvas: null }}
    />,
  );

  expect(screen.getByText("canvas")).toBeInTheDocument();
});

// A pane whose artifact does not exist yet is the normal case in a new Room:
// you place PRD before there is a PRD. It must invite, not error.
it("invites you to start when the artifact does not exist", () => {
  render(
    <PaneContent
      tool="prd"
      data={{ prd: undefined, prototype: null, canvas: null }}
    />,
  );

  expect(screen.getByText(/no PRD yet/i)).toBeInTheDocument();
});
